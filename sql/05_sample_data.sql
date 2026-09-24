-- =====================================================================
-- 05_sample_data.sql
-- Realistic sample data for SwiftDrive Vehicle Rentals (a representative
-- subset of the 40+ vehicle fleet and three-location footprint described
-- in the proposal - Windhoek Head Office, Swakopmund Branch, Walvis Bay
-- Branch). Exercises every business rule and every report.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------
INSERT INTO Branch (BranchName, AddressLine, City, Phone, IsHeadOffice) VALUES
('Windhoek Head Office', '12 Independence Avenue', 'Windhoek', '+264 61 123 456', TRUE),
('Swakopmund Branch',    '45 Sam Nujoma Avenue',   'Swakopmund', '+264 64 234 567', FALSE),
('Walvis Bay Branch',    '8 Nangolo Mbumba Drive', 'Walvis Bay', '+264 64 345 678', FALSE);

-- ---------------------------------------------------------------------
-- Vehicle categories (rates in NAD)
-- ---------------------------------------------------------------------
INSERT INTO VehicleCategory (CategoryName, DailyRate, DepositAmount) VALUES
('Economy', 550.00,  1500.00),
('SUV',     950.00,  3000.00),
('Luxury', 1800.00,  6000.00),
('Van',    1200.00,  3500.00),
('Truck',  1500.00,  4000.00);

-- ---------------------------------------------------------------------
-- Vehicles (representative subset of the fleet)
-- ---------------------------------------------------------------------
INSERT INTO Vehicle (RegistrationNumber, CategoryID, BranchID, Make, Model, ManufactureYear, Odometer, Status) VALUES
('N1001W', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Economy'), (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'), 'Toyota',    'Starlet',  2023, 18500, 'Available'),
('N1002W', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Economy'), (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'), 'Volkswagen','Polo Vivo',2022, 32100, 'Available'),
('N1003S', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Economy'), (SELECT BranchID FROM Branch WHERE BranchName='Swakopmund Branch'),    'Hyundai',   'Grand i10',2023, 12400, 'Available'),
('N2001W', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='SUV'),     (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'), 'Toyota',    'Fortuner', 2022, 41200, 'Available'),
('N2002S', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='SUV'),     (SELECT BranchID FROM Branch WHERE BranchName='Swakopmund Branch'),    'Ford',      'Everest',  2023, 22750, 'Available'),
('N2003B', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='SUV'),     (SELECT BranchID FROM Branch WHERE BranchName='Walvis Bay Branch'),    'Nissan',    'X-Trail',  2021, 55300, 'Available'),
('N3001B', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Luxury'),  (SELECT BranchID FROM Branch WHERE BranchName='Walvis Bay Branch'),    'BMW',       '5 Series', 2023, 9800,  'Available'),
('N3002W', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Luxury'),  (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'), 'Mercedes-Benz','E-Class',2022, 15600, 'Available'),
('N4001W', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Van'),     (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'), 'Toyota',    'Quantum',  2021, 68400, 'Available'),
('N4002S', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Van'),     (SELECT BranchID FROM Branch WHERE BranchName='Swakopmund Branch'),    'Volkswagen','Transporter',2022, 39200, 'Available'),
('N5001W', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Truck'),   (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'), 'Isuzu',     'D-Max',    2021, 71300, 'Available'),
('N5002B', (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Truck'),   (SELECT BranchID FROM Branch WHERE BranchName='Walvis Bay Branch'),    'Ford',      'Ranger',   2022, 48900, 'Available');

-- ---------------------------------------------------------------------
-- Customers - Individual
-- ---------------------------------------------------------------------
INSERT INTO Customer (CustomerType, Email, Phone, AddressLine) VALUES
('Individual', 'anna.shilongo@example.com',   '+264 81 111 2222', '4 Nelson Mandela Ave, Windhoek'),
('Individual', 'petrus.nghixulifwa@example.com','+264 81 222 3333','19 Independence Way, Windhoek'),
('Individual', 'ndeshi.amadhila@example.com', '+264 81 333 4444', '7 Theo-Ben Gurirab St, Walvis Bay'),
('Individual', 'maria.uushona@example.com',   '+264 81 444 5555', '22 Curt von Francois St, Windhoek'),
('Individual', 'sakaria.iyambo@example.com',  '+264 81 555 6666', '3 Hage Geingob Rd, Windhoek'),
('Individual', 'rauna.amupolo@example.com',   '+264 81 666 7777', '14 Sam Nujoma Ave, Walvis Bay');

INSERT INTO IndividualCustomer (CustomerID, FirstName, LastName, DriverLicenseNumber, LicenseExpiryDate, DateOfBirth)
SELECT CustomerID, 'Anna', 'Shilongo', 'DL-NA-100234', DATE '2028-06-30', DATE '1992-03-14' FROM Customer WHERE Email='anna.shilongo@example.com'
UNION ALL
SELECT CustomerID, 'Petrus', 'Nghixulifwa', 'DL-NA-100561', DATE '2027-11-15', DATE '1988-07-22' FROM Customer WHERE Email='petrus.nghixulifwa@example.com'
UNION ALL
SELECT CustomerID, 'Ndeshi', 'Amadhila', 'DL-NA-100872', DATE '2026-12-01', DATE '1995-01-09' FROM Customer WHERE Email='ndeshi.amadhila@example.com'
UNION ALL
SELECT CustomerID, 'Maria', 'Uushona', 'DL-NA-101045', DATE '2029-04-18', DATE '1990-10-30' FROM Customer WHERE Email='maria.uushona@example.com'
UNION ALL
SELECT CustomerID, 'Sakaria', 'Iyambo', 'DL-NA-101198', DATE '2027-02-27', DATE '1985-05-05' FROM Customer WHERE Email='sakaria.iyambo@example.com'
UNION ALL
SELECT CustomerID, 'Rauna', 'Amupolo', 'DL-NA-101299', DATE '2028-09-09', DATE '1993-12-19' FROM Customer WHERE Email='rauna.amupolo@example.com';

-- ---------------------------------------------------------------------
-- Customers - Corporate
-- ---------------------------------------------------------------------
INSERT INTO Customer (CustomerType, Email, Phone, AddressLine) VALUES
('Corporate', 'accounts@ondililogistics.com.na', '+264 61 700 1000', '55 Industrial Rd, Windhoek'),
('Corporate', 'reservations@namibsunhotels.com.na','+264 64 700 2000','1 Beach Rd, Swakopmund'),
('Corporate', 'fleet@kuneneminingservices.com.na', '+264 64 700 3000', '9 Mining Park, Walvis Bay');

INSERT INTO CorporateCustomer (CustomerID, CompanyName, CompanyRegNumber, ContactPersonName, CreditLimit)
SELECT CustomerID, 'Ondili Logistics (Pty) Ltd', 'CC/2018/04521', 'Simon Ngatjizeko', 50000.00 FROM Customer WHERE Email='accounts@ondililogistics.com.na'
UNION ALL
SELECT CustomerID, 'Namib Sun Hotels', 'CC/2015/01187', 'Beatrice Kandjii', 80000.00 FROM Customer WHERE Email='reservations@namibsunhotels.com.na'
UNION ALL
SELECT CustomerID, 'Kunene Mining Services', 'CC/2020/07734', 'Erastus Haufiku', 120000.00 FROM Customer WHERE Email='fleet@kuneneminingservices.com.na';

INSERT INTO AuthorizedDriver (CustomerID, FullName, DriverLicenseNumber, LicenseExpiryDate)
SELECT CustomerID, 'Tuhafeni Shikongo', 'DL-NA-200011', DATE '2027-08-01' FROM CorporateCustomer WHERE CompanyName='Namib Sun Hotels';

-- ---------------------------------------------------------------------
-- Staff, roles and application users
-- ---------------------------------------------------------------------
INSERT INTO Staff (BranchID, FullName, Email, JobRole) VALUES
((SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'), 'Helena Nakale',   'helena.nakale@swiftdrive.com.na',   'Administrator'),
((SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'), 'Given Mwandingi', 'given.mwandingi@swiftdrive.com.na', 'DBA'),
((SELECT BranchID FROM Branch WHERE BranchName='Swakopmund Branch'),    'Loide Amutenya',  'loide.amutenya@swiftdrive.com.na',  'Administrator'),
((SELECT BranchID FROM Branch WHERE BranchName='Walvis Bay Branch'),    'Absalom Katjivena','absalom.katjivena@swiftdrive.com.na','Administrator'),
((SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'), 'Justina Nangolo', 'justina.nangolo@swiftdrive.com.na',  'Manager');

INSERT INTO AppRole (RoleName, Description) VALUES
('Administrator', 'Registers customers, records bookings/agreements, captures payments, generates invoices.'),
('Manager',       'Full reporting access; oversees branch performance.'),
('DBA',           'Manages the database itself: accounts, permissions, backups, performance, security.');

INSERT INTO AppUser (StaffID, RoleID, Username, PasswordHash)
SELECT s.StaffID, r.RoleID, LOWER(SPLIT_PART(s.FullName,' ',1)) || '.' || LOWER(SPLIT_PART(s.FullName,' ',2)),
       'HASH_' || MD5(s.Email)
FROM Staff s JOIN AppRole r ON r.RoleName = s.JobRole;

-- ---------------------------------------------------------------------
-- Booking / Rental lifecycle scenarios
-- All dates are relative to CURRENT_DATE so the sample data - and every
-- report built on it - stays meaningful no matter when this script is
-- executed or marked.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_customer_id   INT;
    v_booking_id    INT;
    v_vehicle_id    INT;
    v_staff_id      INT;
    v_agreement_id  INT;
    v_invoice_id    INT;
    v_total         NUMERIC(10,2);
BEGIN
    -- =================================================================
    -- Scenario A: Anna Shilongo - first-time customer, on-time return,
    -- no damage, invoice paid in full.
    -- =================================================================
    SELECT CustomerID INTO v_customer_id FROM Customer WHERE Email='anna.shilongo@example.com';
    SELECT StaffID INTO v_staff_id FROM Staff WHERE Email='helena.nakale@swiftdrive.com.na';
    SELECT VehicleID INTO v_vehicle_id FROM Vehicle WHERE RegistrationNumber='N1001W';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Economy'),
            (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'),
            CURRENT_DATE - 10, CURRENT_DATE - 5)
    RETURNING BookingID INTO v_booking_id;

    CALL sp_confirm_booking(v_booking_id, v_vehicle_id, v_staff_id, 1500.00, v_agreement_id);
    CALL sp_process_return(v_agreement_id, 18920, CURRENT_DATE - 5, FALSE, 'Returned clean, no damage.');
    CALL sp_generate_invoice(v_agreement_id, v_invoice_id);

    SELECT TotalAmount INTO v_total FROM Invoice WHERE InvoiceID = v_invoice_id;
    INSERT INTO Payment (AgreementID, Amount, PaymentMethod, PaymentType) VALUES (v_agreement_id, v_total, 'Cash', 'RentalFee');
    UPDATE Invoice SET AmountPaid = TotalAmount, InvoiceStatus='Paid' WHERE InvoiceID = v_invoice_id;

    -- =================================================================
    -- Scenario B: Petrus Nghixulifwa - first-time customer, LATE return
    -- (business rule: late-return penalty), invoice only partially paid.
    -- =================================================================
    SELECT CustomerID INTO v_customer_id FROM Customer WHERE Email='petrus.nghixulifwa@example.com';
    SELECT StaffID INTO v_staff_id FROM Staff WHERE Email='helena.nakale@swiftdrive.com.na';
    SELECT VehicleID INTO v_vehicle_id FROM Vehicle WHERE RegistrationNumber='N2001W';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='SUV'),
            (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'),
            CURRENT_DATE - 15, CURRENT_DATE - 8)
    RETURNING BookingID INTO v_booking_id;

    CALL sp_confirm_booking(v_booking_id, v_vehicle_id, v_staff_id, 3000.00, v_agreement_id);
    CALL sp_process_return(v_agreement_id, 41950, CURRENT_DATE - 5, FALSE, 'Returned 3 days late, vehicle otherwise fine.');
    CALL sp_generate_invoice(v_agreement_id, v_invoice_id);

    -- customer settles only the base rental fee today, penalty outstanding
    INSERT INTO Payment (AgreementID, Amount, PaymentMethod, PaymentType) VALUES (v_agreement_id, 4900.00, 'Card', 'RentalFee');
    UPDATE Invoice SET AmountPaid = 4900.00, InvoiceStatus='PartiallyPaid' WHERE InvoiceID = v_invoice_id;

    -- =================================================================
    -- Scenario C1: Ondili Logistics (corporate) - first rental, deposit
    -- required, on-time return, invoice paid in full (EFT).
    -- =================================================================
    SELECT CustomerID INTO v_customer_id FROM Customer WHERE Email='accounts@ondililogistics.com.na';
    SELECT StaffID INTO v_staff_id FROM Staff WHERE Email='helena.nakale@swiftdrive.com.na';
    SELECT VehicleID INTO v_vehicle_id FROM Vehicle WHERE RegistrationNumber='N4001W';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Van'),
            (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'),
            CURRENT_DATE - 20, CURRENT_DATE - 13)
    RETURNING BookingID INTO v_booking_id;

    CALL sp_confirm_booking(v_booking_id, v_vehicle_id, v_staff_id, 3500.00, v_agreement_id);
    CALL sp_process_return(v_agreement_id, 68950, CURRENT_DATE - 13, FALSE, 'Fleet vehicle returned on schedule.');
    CALL sp_generate_invoice(v_agreement_id, v_invoice_id);

    SELECT TotalAmount INTO v_total FROM Invoice WHERE InvoiceID = v_invoice_id;
    INSERT INTO Payment (AgreementID, Amount, PaymentMethod, PaymentType) VALUES (v_agreement_id, v_total, 'EFT', 'RentalFee');
    UPDATE Invoice SET AmountPaid = TotalAmount, InvoiceStatus='Paid' WHERE InvoiceID = v_invoice_id;

    -- =================================================================
    -- Scenario C2: Ondili Logistics - SECOND rental. Because they now
    -- have one Closed agreement, trg_02_require_deposit must ALLOW a
    -- zero deposit here (proves the "new customers only" business rule
    -- is scoped correctly, not applied to every rental). Also left as
    -- an OPEN, OVERDUE agreement to populate the overdue-returns report.
    -- =================================================================
    SELECT VehicleID INTO v_vehicle_id FROM Vehicle WHERE RegistrationNumber='N5001W';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Truck'),
            (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'),
            CURRENT_DATE - 6, CURRENT_DATE - 1)
    RETURNING BookingID INTO v_booking_id;

    CALL sp_confirm_booking(v_booking_id, v_vehicle_id, v_staff_id, 0.00, v_agreement_id);
    -- deliberately NOT returned yet -> appears in vw_OverdueReturns

    -- =================================================================
    -- Scenario D: Ndeshi Amadhila - first-time customer, DAMAGE found on
    -- return (business rule: vehicle status -> Maintenance, not
    -- Available). Invoice left Unpaid to show outstanding revenue.
    -- =================================================================
    SELECT CustomerID INTO v_customer_id FROM Customer WHERE Email='ndeshi.amadhila@example.com';
    SELECT StaffID INTO v_staff_id FROM Staff WHERE Email='absalom.katjivena@swiftdrive.com.na';
    SELECT VehicleID INTO v_vehicle_id FROM Vehicle WHERE RegistrationNumber='N3001B';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Luxury'),
            (SELECT BranchID FROM Branch WHERE BranchName='Walvis Bay Branch'),
            CURRENT_DATE - 9, CURRENT_DATE - 2)
    RETURNING BookingID INTO v_booking_id;

    CALL sp_confirm_booking(v_booking_id, v_vehicle_id, v_staff_id, 6000.00, v_agreement_id);
    CALL sp_process_return(v_agreement_id, 10100, CURRENT_DATE - 2, TRUE, 'Front bumper scratched and rear-view mirror cracked - workshop assessment required.');
    CALL sp_generate_invoice(v_agreement_id, v_invoice_id);

    -- staff adds the workshop's damage-repair quote as an extra invoice line
    INSERT INTO InvoiceLine (InvoiceID, Description, Amount) VALUES (v_invoice_id, 'Damage repair fee - bumper and mirror', 2450.00);
    UPDATE Invoice SET TotalAmount = TotalAmount + 2450.00 WHERE InvoiceID = v_invoice_id;
    -- invoice deliberately left Unpaid

    -- =================================================================
    -- Scenario E: Maria Uushona - first-time customer, CURRENTLY ACTIVE
    -- rental, well within the expected return window (not overdue).
    -- =================================================================
    SELECT CustomerID INTO v_customer_id FROM Customer WHERE Email='maria.uushona@example.com';
    SELECT StaffID INTO v_staff_id FROM Staff WHERE Email='helena.nakale@swiftdrive.com.na';
    SELECT VehicleID INTO v_vehicle_id FROM Vehicle WHERE RegistrationNumber='N1002W';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Economy'),
            (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'),
            CURRENT_DATE - 1, CURRENT_DATE + 4)
    RETURNING BookingID INTO v_booking_id;

    CALL sp_confirm_booking(v_booking_id, v_vehicle_id, v_staff_id, 1500.00, v_agreement_id);

    -- =================================================================
    -- Scenario F: Namib Sun Hotels (corporate) - first rental, currently
    -- active, not overdue.
    -- =================================================================
    SELECT CustomerID INTO v_customer_id FROM Customer WHERE Email='reservations@namibsunhotels.com.na';
    SELECT StaffID INTO v_staff_id FROM Staff WHERE Email='loide.amutenya@swiftdrive.com.na';
    SELECT VehicleID INTO v_vehicle_id FROM Vehicle WHERE RegistrationNumber='N2002S';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='SUV'),
            (SELECT BranchID FROM Branch WHERE BranchName='Swakopmund Branch'),
            CURRENT_DATE - 3, CURRENT_DATE + 2)
    RETURNING BookingID INTO v_booking_id;

    CALL sp_confirm_booking(v_booking_id, v_vehicle_id, v_staff_id, 3000.00, v_agreement_id);

    -- =================================================================
    -- Scenario G: Sakaria Iyambo - booking CANCELLED before pickup
    -- (no rental agreement is ever created for a cancelled booking).
    -- =================================================================
    SELECT CustomerID INTO v_customer_id FROM Customer WHERE Email='sakaria.iyambo@example.com';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected, BookingStatus)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Economy'),
            (SELECT BranchID FROM Branch WHERE BranchName='Windhoek Head Office'),
            CURRENT_DATE + 3, CURRENT_DATE + 7, 'Cancelled');

    -- =================================================================
    -- Scenario H: Rauna Amupolo - booking REQUESTED for pickup TODAY,
    -- still awaiting vehicle assignment (feeds vw_TodaysBookings).
    -- =================================================================
    SELECT CustomerID INTO v_customer_id FROM Customer WHERE Email='rauna.amupolo@example.com';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected, BookingStatus)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='SUV'),
            (SELECT BranchID FROM Branch WHERE BranchName='Walvis Bay Branch'),
            CURRENT_DATE, CURRENT_DATE + 4, 'Requested');

    -- =================================================================
    -- Scenario I: Kunene Mining Services - booking REQUESTED for pickup
    -- TODAY (second row in vw_TodaysBookings, and a corporate account
    -- with no agreements yet, to show CreditLimit in the full directory).
    -- =================================================================
    SELECT CustomerID INTO v_customer_id FROM Customer WHERE Email='fleet@kuneneminingservices.com.na';

    INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected, BookingStatus)
    VALUES (NEXTVAL('booking_ref_seq'), v_customer_id,
            (SELECT CategoryID FROM VehicleCategory WHERE CategoryName='Truck'),
            (SELECT BranchID FROM Branch WHERE BranchName='Walvis Bay Branch'),
            CURRENT_DATE, CURRENT_DATE + 6, 'Requested');

END $$;
