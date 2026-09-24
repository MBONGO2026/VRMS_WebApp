-- =====================================================================
-- 09_reports_and_queries.sql
-- Specific Objective 6: "Develop SQL queries for common operations such
-- as checking availability, recording bookings and generating reports."
-- Specific Objective 8: "Produce reports on daily bookings, fleet
-- utilisation, revenue and overdue returns."
--
-- Each query is annotated with the relational-algebra operation it
-- corresponds to (Lesson 1: Selection sigma / Projection pi / Join
-- bowtie), showing how the declarative SQL (Tuple Relational Calculus,
-- per Lesson 1) maps back onto the formal, procedural theory.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Q1. Checking vehicle availability by category and branch
-- Relational algebra: sigma (Status='Available') applied to a JOIN
-- (Vehicle bowtie VehicleCategory bowtie Branch), then a pi projection
-- onto the columns front-desk staff actually need to see.
-- ---------------------------------------------------------------------
SELECT RegistrationNumber, Make, Model, CategoryName, BranchName
FROM vw_VehicleAvailability
WHERE Status = 'Available'
ORDER BY CategoryName, BranchName;

-- ---------------------------------------------------------------------
-- Q2. Recording a booking (Specific Objective 6). In production this is
-- exactly what the front-desk staff form runs; booking_ref_seq (Lesson
-- 3) supplies the customer-facing reference number.
-- ---------------------------------------------------------------------
-- Example (not executed here - shown as the canonical statement):
--
-- INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
-- VALUES (NEXTVAL('booking_ref_seq'), :customer_id, :category_id, :branch_id, :pickup_date, :return_date);

-- ---------------------------------------------------------------------
-- Q3. Daily bookings report - Selection (sigma PickupDate = today)
-- ---------------------------------------------------------------------
SELECT * FROM vw_TodaysBookings ORDER BY BookingID;

-- ---------------------------------------------------------------------
-- Q4. Fleet utilisation report - GROUP BY + aggregate (a relational
-- algebra extension beyond the six basic operations, needed for
-- "revenue by vehicle type" style management reporting).
-- ---------------------------------------------------------------------
SELECT * FROM vw_FleetUtilization ORDER BY UtilizationPercent DESC;

-- ---------------------------------------------------------------------
-- Q5. Revenue analysis by vehicle type
-- ---------------------------------------------------------------------
SELECT * FROM vw_RevenueByVehicleType ORDER BY TotalRevenue DESC;

-- ---------------------------------------------------------------------
-- Q6. Overdue returns report
-- ---------------------------------------------------------------------
SELECT * FROM vw_OverdueReturns ORDER BY DaysOverdue DESC;

-- ---------------------------------------------------------------------
-- Q7. Complete rental history for one customer - Join (bowtie) across
-- five relations, exactly the "reconstructing a customer's rental
-- history for an insurance claim" scenario the proposal names as
-- currently taking hours (Problem Identification, "Slow retrieval").
-- Here it takes milliseconds.
-- ---------------------------------------------------------------------
SELECT
    c.CustomerID,
    ic.FirstName || ' ' || ic.LastName AS CustomerName,
    ra.AgreementID,
    v.RegistrationNumber,
    ra.ActualPickupDate,
    ra.ActualReturnDate,
    i.InvoiceID,
    i.TotalAmount,
    i.InvoiceStatus
FROM Customer c
JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
JOIN Booking bk ON bk.CustomerID = c.CustomerID
JOIN RentalAgreement ra ON ra.BookingID = bk.BookingID
JOIN Vehicle v ON v.VehicleID = ra.VehicleID
LEFT JOIN Invoice i ON i.AgreementID = ra.AgreementID
WHERE c.Email = 'anna.shilongo@example.com'
ORDER BY ra.ActualPickupDate;

-- ---------------------------------------------------------------------
-- Q8. Bookings per category (GROUP BY ... HAVING) - "Bonus: write a
-- query using GROUP BY to count enrolments per course", adapted from
-- Lesson 1's practical exercise to "count bookings per category".
-- ---------------------------------------------------------------------
SELECT vc.CategoryName, COUNT(bk.BookingID) AS TotalBookings
FROM VehicleCategory vc
LEFT JOIN Booking bk ON bk.CategoryID = vc.CategoryID
GROUP BY vc.CategoryName
ORDER BY TotalBookings DESC;

-- ---------------------------------------------------------------------
-- Q9. Restricted vs full customer view - proves Objective 9's "restrict
-- access to sensitive data" half in practice: the restricted view never
-- exposes a driver's licence number or credit limit.
-- ---------------------------------------------------------------------
SELECT * FROM vw_CustomerDirectory_Restricted ORDER BY CustomerID LIMIT 5;
SELECT column_name FROM information_schema.columns WHERE table_name = 'vw_customerdirectory_restricted';

-- ---------------------------------------------------------------------
-- Q10. Outstanding balances - customers who still owe money, for the
-- credit-control follow-up the Justification section promises
-- ("Better decision-making").
-- ---------------------------------------------------------------------
SELECT
    CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS CustomerName,
    i.InvoiceID,
    i.TotalAmount,
    i.AmountPaid,
    (i.TotalAmount - i.AmountPaid) AS Balance
FROM Invoice i
JOIN RentalAgreement ra ON ra.AgreementID = i.AgreementID
JOIN Booking bk ON bk.BookingID = ra.BookingID
JOIN Customer c ON c.CustomerID = bk.CustomerID
LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
WHERE i.TotalAmount > i.AmountPaid
ORDER BY Balance DESC;
