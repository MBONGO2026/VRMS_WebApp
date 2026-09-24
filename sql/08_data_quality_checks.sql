-- =====================================================================
-- 08_data_quality_checks.sql
-- Applies Lesson 2, Section 5 (Data Quality Assessment Techniques) to
-- the live VRMS database. Passing all integrity CONSTRAINTS does not
-- guarantee good DATA QUALITY (Lesson 2, slide 5) - these queries
-- actively measure the six dimensions instead of assuming they hold.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NULL value audit -> measures COMPLETENESS
-- ---------------------------------------------------------------------
SELECT
    COUNT(*) AS TotalCustomers,
    SUM(CASE WHEN Email IS NULL THEN 1 ELSE 0 END) AS NullEmails,
    SUM(CASE WHEN Phone IS NULL THEN 1 ELSE 0 END) AS NullPhones,
    ROUND(100.0 * SUM(CASE WHEN Email IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS EmailCompletenessPercent
FROM Customer;

-- ---------------------------------------------------------------------
-- 2. Duplicate detection -> measures UNIQUENESS
-- (Same real-world customer captured twice under slightly different
-- emails would defeat UQ_Customer_Email; this checks by name+DOB too,
-- exactly the "Anna Shilongo appearing six times" scenario in Lesson 2.)
-- ---------------------------------------------------------------------
SELECT ic.FirstName, ic.LastName, ic.DateOfBirth, COUNT(*) AS DuplicateCount
FROM IndividualCustomer ic
GROUP BY ic.FirstName, ic.LastName, ic.DateOfBirth
HAVING COUNT(*) > 1;
-- (Expected: 0 rows - confirms no duplicate individual customers in VRMS.)

-- ---------------------------------------------------------------------
-- 3. Range & format validation -> measures VALIDITY
-- ---------------------------------------------------------------------
SELECT VehicleID, RegistrationNumber, Odometer
FROM Vehicle
WHERE Odometer < 0 OR Odometer > 500000;   -- unrealistic odometer readings

SELECT CustomerID, Email
FROM Customer
WHERE Email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
-- (CK_Customer_Email_Format already prevents this at insert time - this
-- query is the ongoing monitoring equivalent for data loaded by other
-- means, e.g. a future bulk import or migration from the old spreadsheets.)

-- ---------------------------------------------------------------------
-- 4. Referential integrity audit -> measures CONSISTENCY
-- (Orphan rows are already impossible thanks to FOREIGN KEY constraints;
-- this query is the same defensive check the lesson teaches, run here
-- as proof rather than assumption.)
-- ---------------------------------------------------------------------
SELECT ra.AgreementID, ra.VehicleID
FROM RentalAgreement ra
LEFT JOIN Vehicle v ON v.VehicleID = ra.VehicleID
WHERE v.VehicleID IS NULL;
-- (Expected: 0 rows.)

SELECT bk.BookingID, bk.CustomerID
FROM Booking bk
LEFT JOIN Customer c ON c.CustomerID = bk.CustomerID
WHERE c.CustomerID IS NULL;
-- (Expected: 0 rows.)

-- ---------------------------------------------------------------------
-- 5. Accuracy spot-check (Lesson 2: "Data correctly represents the
-- real-world entity it describes - regardless of whether it passes
-- constraints") - a rental agreement can technically satisfy every
-- CHECK constraint yet still be wrong if the return odometer reading
-- looks implausible for the number of days rented (e.g. 2,000 km/day).
-- ---------------------------------------------------------------------
SELECT
    ra.AgreementID,
    ra.ActualPickupDate,
    ra.ActualReturnDate,
    (ra.ActualReturnDate - ra.ActualPickupDate) AS DaysRented,
    (ra.OdometerIn - ra.OdometerOut) AS KmTravelled,
    ROUND((ra.OdometerIn - ra.OdometerOut)::NUMERIC / GREATEST(1, ra.ActualReturnDate - ra.ActualPickupDate), 1) AS KmPerDay
FROM RentalAgreement ra
WHERE ra.OdometerIn IS NOT NULL
ORDER BY KmPerDay DESC;

-- ---------------------------------------------------------------------
-- 6. Timeliness check - a customer record that has not been touched in
-- a long time is not necessarily wrong, but it is worth flagging for
-- review (Lesson 2: "structurally valid but stale").
-- ---------------------------------------------------------------------
SELECT CustomerID, Email, DateRegistered, CURRENT_DATE - DateRegistered AS DaysSinceRegistration
FROM Customer
WHERE DateRegistered < CURRENT_DATE - INTERVAL '5 years';
-- (Expected: 0 rows in this freshly-seeded database - included to show
-- how staleness would be monitored once VRMS has been live for years.)
