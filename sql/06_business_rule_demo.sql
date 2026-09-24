-- =====================================================================
-- 06_business_rule_demo.sql
-- Deliberately attempts operations that violate the integrity rules
-- built into the schema (Lesson 2, Section 3) and the user-defined
-- business-rule triggers (03_functions_triggers.sql), to prove they
-- are actually enforced by the DATABASE - not just assumed. Each
-- attempt is wrapped in its own BEGIN/EXCEPTION block so one rejected
-- statement does not abort the whole demonstration; the caught error
-- message is printed with RAISE NOTICE as proof of rejection.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DEMO 1 : Referential integrity - a booking cannot reference a vehicle
-- category that does not exist (Lesson 2, Consistency example: "inserting
-- an Enrolment with a non-existent StudentID is rejected outright").
-- ---------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
        VALUES (NEXTVAL('booking_ref_seq'), 1, 9999, 1, CURRENT_DATE, CURRENT_DATE + 1);
        RAISE NOTICE 'DEMO 1 FAILED TO REJECT - this should not print.';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'DEMO 1 PASSED - referential integrity rejected non-existent CategoryID 9999: %', SQLERRM;
    END;
END $$;

-- ---------------------------------------------------------------------
-- DEMO 2 : Domain integrity - CHECK constraint rejects a nonsensical
-- booking where the return date is before the pickup date.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
        VALUES (NEXTVAL('booking_ref_seq'), 1, 1, 1, CURRENT_DATE + 5, CURRENT_DATE);
        RAISE NOTICE 'DEMO 2 FAILED TO REJECT - this should not print.';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'DEMO 2 PASSED - CK_Booking_Dates rejected a return date before the pickup date: %', SQLERRM;
    END;
END $$;

-- ---------------------------------------------------------------------
-- DEMO 3 : User-defined integrity (trigger) - double-booking a vehicle
-- that is already on an active rental agreement is rejected.
-- N1002W is currently "Rented" to Maria Uushona (Scenario E).
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_conflicting_vehicle INT;
    v_new_booking INT;
    v_new_agreement INT;
BEGIN
    SELECT VehicleID INTO v_conflicting_vehicle FROM Vehicle WHERE RegistrationNumber = 'N1002W';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
    VALUES (NEXTVAL('booking_ref_seq'), 1,
            (SELECT CategoryID FROM Vehicle WHERE VehicleID = v_conflicting_vehicle),
            1, CURRENT_DATE, CURRENT_DATE + 2)
    RETURNING BookingID INTO v_new_booking;

    BEGIN
        v_new_agreement := NEXTVAL('agreement_id_seq');
        INSERT INTO RentalAgreement (AgreementID, BookingID, VehicleID, StaffID, ActualPickupDate, OdometerOut, DailyRateApplied, DepositPaid)
        VALUES (v_new_agreement, v_new_booking, v_conflicting_vehicle, 1, CURRENT_DATE, 0, 550.00, 1500.00);
        RAISE NOTICE 'DEMO 3 FAILED TO REJECT - this should not print.';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'DEMO 3 PASSED - trg_01_prevent_double_booking rejected the overlapping booking of vehicle %: %', v_conflicting_vehicle, SQLERRM;
    END;
END $$;

-- ---------------------------------------------------------------------
-- DEMO 4 : User-defined integrity (trigger) - a brand-new customer with
-- no completed rental history must pay the category deposit.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_new_customer  INT;
    v_new_booking   INT;
    v_new_agreement INT;
    v_vehicle       INT;
BEGIN
    INSERT INTO Customer (CustomerType, Email, Phone, AddressLine)
    VALUES ('Individual', 'walter.hamutenya@example.com', '+264 81 999 0000', '2 Robert Mugabe Ave, Windhoek')
    RETURNING CustomerID INTO v_new_customer;

    INSERT INTO IndividualCustomer (CustomerID, FirstName, LastName, DriverLicenseNumber, LicenseExpiryDate, DateOfBirth)
    VALUES (v_new_customer, 'Walter', 'Hamutenya', 'DL-NA-109900', DATE '2028-01-01', DATE '1991-06-06');

    SELECT VehicleID INTO v_vehicle FROM Vehicle WHERE RegistrationNumber = 'N1003S';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
    VALUES (NEXTVAL('booking_ref_seq'), v_new_customer,
            (SELECT CategoryID FROM Vehicle WHERE VehicleID = v_vehicle),
            (SELECT BranchID FROM Vehicle WHERE VehicleID = v_vehicle),
            CURRENT_DATE + 1, CURRENT_DATE + 3)
    RETURNING BookingID INTO v_new_booking;

    BEGIN
        CALL sp_confirm_booking(v_new_booking, v_vehicle, 1, 0.00, v_new_agreement);
        RAISE NOTICE 'DEMO 4 FAILED TO REJECT - this should not print.';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'DEMO 4 PASSED - trg_02_require_deposit rejected a zero deposit for first-time customer %: %', v_new_customer, SQLERRM;
    END;

    -- show the rule again succeeding once the correct deposit is paid
    CALL sp_confirm_booking(v_new_booking, v_vehicle, 1, 1500.00, v_new_agreement);
    RAISE NOTICE 'DEMO 4b - same booking succeeded once the required deposit (1500.00) was supplied, agreement %.', v_new_agreement;
END $$;

-- ---------------------------------------------------------------------
-- DEMO 5 : Domain integrity - UNIQUE constraint rejects a duplicate
-- driver's licence number (a licence can only belong to one customer).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO Customer (CustomerType, Email, Phone, AddressLine)
        VALUES ('Individual', 'duplicate.license@example.com', '+264 81 000 1111', 'Test Address, Windhoek');

        INSERT INTO IndividualCustomer (CustomerID, FirstName, LastName, DriverLicenseNumber, LicenseExpiryDate, DateOfBirth)
        VALUES (currval(pg_get_serial_sequence('customer','customerid')), 'Test', 'Duplicate', 'DL-NA-100234', DATE '2030-01-01', DATE '1990-01-01');
        RAISE NOTICE 'DEMO 5 FAILED TO REJECT - this should not print.';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'DEMO 5 PASSED - UQ_Individual_License rejected a driver''s licence number already used by Anna Shilongo: %', SQLERRM;
    END;
END $$;
