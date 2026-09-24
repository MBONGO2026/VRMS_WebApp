-- =====================================================================
-- 03_functions_triggers.sql
-- User-defined integrity (Lesson 2, Type 4) + stored procedures
-- (Proposal, Specific Objectives 10 & 11).
--
-- PostgreSQL implements two kinds of "programmable" object used here:
--   - TRIGGER FUNCTIONS (PL/pgSQL, return TRIGGER) fired automatically
--     by INSERT/UPDATE on a table - used for business rules that must
--     apply no matter which application or user changes the data.
--   - PROCEDURES (PL/pgSQL, CREATE PROCEDURE ... CALL ...) - used for
--     repetitive multi-step operations that a member of staff runs
--     deliberately (confirming a booking, generating an invoice).
-- =====================================================================

-- ---------------------------------------------------------------------
-- BUSINESS RULE 1 : "Preventing a booking for an unavailable vehicle"
-- (Proposal, Specific Objective 11 - stated almost verbatim)
-- A vehicle cannot be on two overlapping active rental agreements.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prevent_double_booking() RETURNS TRIGGER AS $$
DECLARE
    v_conflict INT;
BEGIN
    SELECT COUNT(*) INTO v_conflict
    FROM RentalAgreement ra
    WHERE ra.VehicleID = NEW.VehicleID
      AND ra.AgreementID <> COALESCE(NEW.AgreementID, -1)
      AND ra.AgreementStatus = 'Active'
      AND daterange(ra.ActualPickupDate, COALESCE(ra.ActualReturnDate, 'infinity'::date), '[]')
          && daterange(NEW.ActualPickupDate, COALESCE(NEW.ActualReturnDate, 'infinity'::date), '[]');

    IF v_conflict > 0 THEN
        RAISE EXCEPTION 'Double-booking rejected: vehicle % already has an active agreement overlapping % - %.',
            NEW.VehicleID, NEW.ActualPickupDate, COALESCE(NEW.ActualReturnDate::text, 'open-ended');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_01_prevent_double_booking
BEFORE INSERT OR UPDATE ON RentalAgreement
FOR EACH ROW EXECUTE FUNCTION fn_prevent_double_booking();

-- ---------------------------------------------------------------------
-- BUSINESS RULE 2 : "Requiring a deposit for new customers"
-- (Proposal, Project Scope 7.1 - Business rules row)
-- A customer with no prior completed rental must pay at least the
-- category's deposit amount before the agreement is created.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_require_deposit_for_new_customer() RETURNS TRIGGER AS $$
DECLARE
    v_customer_id      INT;
    v_prior_completed  INT;
    v_required_deposit NUMERIC(10,2);
BEGIN
    SELECT b.CustomerID, vc.DepositAmount
      INTO v_customer_id, v_required_deposit
    FROM Booking b
    JOIN VehicleCategory vc ON vc.CategoryID = b.CategoryID
    WHERE b.BookingID = NEW.BookingID;

    SELECT COUNT(*) INTO v_prior_completed
    FROM RentalAgreement ra
    JOIN Booking b ON b.BookingID = ra.BookingID
    WHERE b.CustomerID = v_customer_id
      AND ra.AgreementStatus = 'Closed';

    IF v_prior_completed = 0 AND NEW.DepositPaid < v_required_deposit THEN
        RAISE EXCEPTION 'Deposit rule violation: first-time customer % must pay a deposit of at least % (only % supplied).',
            v_customer_id, TO_CHAR(v_required_deposit, 'FM999999990.00'), TO_CHAR(NEW.DepositPaid, 'FM999999990.00');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_02_require_deposit
BEFORE INSERT ON RentalAgreement
FOR EACH ROW EXECUTE FUNCTION fn_require_deposit_for_new_customer();

-- ---------------------------------------------------------------------
-- BUSINESS RULE 3 : "Automatically updating vehicle status"
-- (Proposal, Specific Objective 11)
-- Checking a vehicle out marks it Rented; recording its return marks
-- it Available (or Maintenance if damage was found on inspection) and
-- closes the agreement + booking.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_close_agreement_on_return() RETURNS TRIGGER AS $$
BEGIN
    -- Runs BEFORE the row is written, so we can adjust NEW directly
    -- instead of issuing a second UPDATE (which would cause the same
    -- trigger to fire again recursively).
    IF NEW.ActualReturnDate IS NOT NULL AND OLD.ActualReturnDate IS NULL THEN
        NEW.AgreementStatus := 'Closed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_03_close_agreement_before_update
BEFORE UPDATE ON RentalAgreement
FOR EACH ROW EXECUTE FUNCTION fn_close_agreement_on_return();

CREATE OR REPLACE FUNCTION fn_sync_vehicle_and_booking_on_checkout() RETURNS TRIGGER AS $$
BEGIN
    UPDATE Vehicle SET Status = 'Rented' WHERE VehicleID = NEW.VehicleID;
    UPDATE Booking SET BookingStatus = 'CheckedOut' WHERE BookingID = NEW.BookingID;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_04_sync_on_checkout
AFTER INSERT ON RentalAgreement
FOR EACH ROW EXECUTE FUNCTION fn_sync_vehicle_and_booking_on_checkout();

CREATE OR REPLACE FUNCTION fn_sync_vehicle_and_booking_on_return() RETURNS TRIGGER AS $$
DECLARE
    v_damage_found BOOLEAN;
BEGIN
    IF NEW.ActualReturnDate IS NOT NULL AND OLD.ActualReturnDate IS NULL THEN
        SELECT COALESCE(BOOL_OR(DamageFound), FALSE) INTO v_damage_found
        FROM VehicleInspection
        WHERE AgreementID = NEW.AgreementID AND InspectionType = 'Return';

        UPDATE Vehicle
           SET Status = CASE WHEN v_damage_found THEN 'Maintenance' ELSE 'Available' END,
               Odometer = NEW.OdometerIn
         WHERE VehicleID = NEW.VehicleID;

        UPDATE Booking SET BookingStatus = 'Completed' WHERE BookingID = NEW.BookingID;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_05_sync_on_return
AFTER UPDATE ON RentalAgreement
FOR EACH ROW EXECUTE FUNCTION fn_sync_vehicle_and_booking_on_return();

-- =====================================================================
-- STORED PROCEDURES
-- =====================================================================

-- ---------------------------------------------------------------------
-- sp_confirm_booking : Specific Objective 10 - "booking confirmation".
-- Assigns a specific, available vehicle from the requested category to
-- a Requested booking and opens the rental agreement (checkout).
-- Demonstrates ATOMICITY (Lesson 2, Section 4): every step below either
-- all succeeds, or the whole procedure raises an exception and NOTHING
-- is written - PostgreSQL treats a procedure call as a transaction.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_confirm_booking(
    p_booking_id    INT,
    p_vehicle_id    INT,
    p_staff_id      INT,
    p_deposit_paid  NUMERIC,
    INOUT p_agreement_id INT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_booking       Booking%ROWTYPE;
    v_vehicle       Vehicle%ROWTYPE;
    v_daily_rate    NUMERIC(10,2);
BEGIN
    SELECT * INTO v_booking FROM Booking WHERE BookingID = p_booking_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % does not exist.', p_booking_id;
    END IF;
    IF v_booking.BookingStatus NOT IN ('Requested','Confirmed') THEN
        RAISE EXCEPTION 'Booking % is in status % and can no longer be confirmed.', p_booking_id, v_booking.BookingStatus;
    END IF;

    SELECT * INTO v_vehicle FROM Vehicle WHERE VehicleID = p_vehicle_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vehicle % does not exist.', p_vehicle_id;
    END IF;
    IF v_vehicle.CategoryID <> v_booking.CategoryID THEN
        RAISE EXCEPTION 'Vehicle % is not in the category the customer booked.', p_vehicle_id;
    END IF;
    IF v_vehicle.Status <> 'Available' THEN
        RAISE EXCEPTION 'Vehicle % is not available (current status: %).', p_vehicle_id, v_vehicle.Status;
    END IF;

    SELECT DailyRate INTO v_daily_rate FROM VehicleCategory WHERE CategoryID = v_booking.CategoryID;

    p_agreement_id := NEXTVAL('agreement_id_seq');

    INSERT INTO RentalAgreement (
        AgreementID, BookingID, VehicleID, StaffID,
        ActualPickupDate, OdometerOut, DailyRateApplied, DepositPaid, AgreementStatus
    ) VALUES (
        p_agreement_id, p_booking_id, p_vehicle_id, p_staff_id,
        v_booking.PickupDate, v_vehicle.Odometer, v_daily_rate, p_deposit_paid, 'Active'
    );

    IF p_deposit_paid > 0 THEN
        INSERT INTO Payment (AgreementID, Amount, PaymentMethod, PaymentType)
        VALUES (p_agreement_id, p_deposit_paid, 'Card', 'Deposit');
    END IF;

    INSERT INTO VehicleInspection (AgreementID, InspectionType, ConditionNotes, DamageFound)
    VALUES (p_agreement_id, 'Pickup', 'Pre-rental inspection - no damage noted.', FALSE);

    RAISE NOTICE 'Booking % confirmed -> Rental Agreement % created for vehicle % (customer %).',
        p_booking_id, p_agreement_id, p_vehicle_id, v_booking.CustomerID;
END;
$$;

-- ---------------------------------------------------------------------
-- sp_process_return : records the vehicle coming back. Triggers 03-05
-- take care of closing the agreement, updating vehicle status and the
-- booking status automatically once this UPDATE is issued.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_process_return(
    p_agreement_id      INT,
    p_odometer_in       INT,
    p_return_date       DATE,
    p_damage_found      BOOLEAN,
    p_condition_notes   VARCHAR
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM RentalAgreement WHERE AgreementID = p_agreement_id AND AgreementStatus = 'Active') THEN
        RAISE EXCEPTION 'Agreement % is not an active agreement.', p_agreement_id;
    END IF;

    INSERT INTO VehicleInspection (AgreementID, InspectionType, ConditionNotes, DamageFound)
    VALUES (p_agreement_id, 'Return', p_condition_notes, p_damage_found);

    UPDATE RentalAgreement
       SET ActualReturnDate = p_return_date,
           OdometerIn = p_odometer_in
     WHERE AgreementID = p_agreement_id;

    RAISE NOTICE 'Agreement % closed - vehicle returned on % at odometer %.', p_agreement_id, p_return_date, p_odometer_in;
END;
$$;

-- ---------------------------------------------------------------------
-- sp_generate_invoice : Specific Objective 10 - "invoice generation".
-- Computes the rental charge, applies the late-return penalty business
-- rule ("applying penalties for late returns" - Proposal 7.1), credits
-- the deposit already paid, and writes Invoice + InvoiceLine as a
-- single atomic unit. invoice_number_seq (Lesson 3) supplies the legal
-- invoice number.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_generate_invoice(
    p_agreement_id INT,
    INOUT p_invoice_id INT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_agreement     RentalAgreement%ROWTYPE;
    v_booking       Booking%ROWTYPE;
    v_days_rented   INT;
    v_late_days     INT;
    v_rental_amount NUMERIC(10,2);
    v_late_fee      NUMERIC(10,2);
    v_total         NUMERIC(10,2);
    v_paid_so_far   NUMERIC(10,2);
BEGIN
    SELECT * INTO v_agreement FROM RentalAgreement WHERE AgreementID = p_agreement_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agreement % does not exist.', p_agreement_id;
    END IF;
    IF v_agreement.ActualReturnDate IS NULL THEN
        RAISE EXCEPTION 'Agreement % has not been returned yet - cannot invoice.', p_agreement_id;
    END IF;
    IF EXISTS (SELECT 1 FROM Invoice WHERE AgreementID = p_agreement_id) THEN
        RAISE EXCEPTION 'Agreement % already has an invoice.', p_agreement_id;
    END IF;

    SELECT * INTO v_booking FROM Booking WHERE BookingID = v_agreement.BookingID;

    v_days_rented := GREATEST(1, v_agreement.ActualReturnDate - v_agreement.ActualPickupDate);
    v_rental_amount := v_days_rented * v_agreement.DailyRateApplied;

    v_late_days := GREATEST(0, v_agreement.ActualReturnDate - v_booking.ReturnDateExpected);
    v_late_fee := v_late_days * (v_agreement.DailyRateApplied * 0.5); -- 50% of daily rate per late day

    v_total := v_rental_amount + v_late_fee;

    p_invoice_id := NEXTVAL('invoice_number_seq');

    INSERT INTO Invoice (InvoiceID, AgreementID, TotalAmount, AmountPaid, InvoiceStatus)
    VALUES (p_invoice_id, p_agreement_id, v_total, 0, 'Unpaid');

    INSERT INTO InvoiceLine (InvoiceID, Description, Amount)
    VALUES (p_invoice_id, FORMAT('Rental fee: %s day(s) @ %s/day', v_days_rented, v_agreement.DailyRateApplied), v_rental_amount);

    IF v_late_days > 0 THEN
        INSERT INTO InvoiceLine (InvoiceID, Description, Amount)
        VALUES (p_invoice_id, FORMAT('Late return penalty: %s day(s)', v_late_days), v_late_fee);
    END IF;

    SELECT COALESCE(SUM(Amount), 0) INTO v_paid_so_far FROM Payment WHERE AgreementID = p_agreement_id;

    UPDATE Invoice
       SET AmountPaid = LEAST(v_paid_so_far, v_total),
           InvoiceStatus = CASE
                WHEN v_paid_so_far >= v_total THEN 'Paid'
                WHEN v_paid_so_far > 0 THEN 'PartiallyPaid'
                ELSE 'Unpaid'
           END
     WHERE InvoiceID = p_invoice_id;

    RAISE NOTICE 'Invoice % generated for agreement % - total % (rental % + late fee %).',
        p_invoice_id, p_agreement_id, v_total, v_rental_amount, v_late_fee;
END;
$$;
