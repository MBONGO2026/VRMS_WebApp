-- =====================================================================
-- 04_views.sql
-- Specific Objective 9: "Implement views to simplify complex queries
-- and restrict access to sensitive data."
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Real-time vehicle availability (replaces the whiteboard!)
-- ---------------------------------------------------------------------
CREATE VIEW vw_VehicleAvailability AS
SELECT
    v.VehicleID,
    v.RegistrationNumber,
    vc.CategoryName,
    v.Make,
    v.Model,
    v.Odometer,
    v.Status,
    b.BranchName
FROM Vehicle v
JOIN VehicleCategory vc ON vc.CategoryID = v.CategoryID
JOIN Branch b ON b.BranchID = v.BranchID;

-- ---------------------------------------------------------------------
-- 2. Daily bookings report (Project Scope 7.1 - Reports)
-- ---------------------------------------------------------------------
CREATE VIEW vw_BookingsDetail AS
SELECT
    bk.BookingID,
    bk.PickupDate,
    bk.ReturnDateExpected,
    bk.BookingStatus,
    br.BranchName,
    vc.CategoryName,
    c.CustomerID,
    CASE c.CustomerType
        WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName
        WHEN 'Corporate'  THEN cc.CompanyName
    END AS CustomerName
FROM Booking bk
JOIN Branch br ON br.BranchID = bk.BranchID
JOIN VehicleCategory vc ON vc.CategoryID = bk.CategoryID
JOIN Customer c ON c.CustomerID = bk.CustomerID
LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID;

CREATE VIEW vw_TodaysBookings AS
SELECT * FROM vw_BookingsDetail WHERE PickupDate = CURRENT_DATE;

-- ---------------------------------------------------------------------
-- 3. Fleet utilisation report - % of each category's fleet on the road
-- ---------------------------------------------------------------------
CREATE VIEW vw_FleetUtilization AS
SELECT
    vc.CategoryID,
    vc.CategoryName,
    COUNT(v.VehicleID) AS TotalVehicles,
    COUNT(v.VehicleID) FILTER (WHERE v.Status = 'Rented') AS VehiclesRented,
    COUNT(v.VehicleID) FILTER (WHERE v.Status = 'Available') AS VehiclesAvailable,
    COUNT(v.VehicleID) FILTER (WHERE v.Status = 'Maintenance') AS VehiclesInMaintenance,
    ROUND(
        100.0 * COUNT(v.VehicleID) FILTER (WHERE v.Status = 'Rented')
        / NULLIF(COUNT(v.VehicleID), 0), 1
    ) AS UtilizationPercent
FROM VehicleCategory vc
LEFT JOIN Vehicle v ON v.CategoryID = vc.CategoryID
GROUP BY vc.CategoryID, vc.CategoryName;

-- ---------------------------------------------------------------------
-- 4. Revenue analysis by vehicle type (Project Scope 7.1 - Reports)
-- ---------------------------------------------------------------------
CREATE VIEW vw_RevenueByVehicleType AS
SELECT
    vc.CategoryID,
    vc.CategoryName,
    COUNT(DISTINCT i.InvoiceID) AS InvoicesIssued,
    COALESCE(SUM(i.TotalAmount), 0) AS TotalRevenue,
    COALESCE(SUM(i.AmountPaid), 0) AS TotalCollected,
    COALESCE(SUM(i.TotalAmount - i.AmountPaid), 0) AS TotalOutstanding
FROM VehicleCategory vc
LEFT JOIN Vehicle v ON v.CategoryID = vc.CategoryID
LEFT JOIN RentalAgreement ra ON ra.VehicleID = v.VehicleID
LEFT JOIN Invoice i ON i.AgreementID = ra.AgreementID
GROUP BY vc.CategoryID, vc.CategoryName;

-- ---------------------------------------------------------------------
-- 5. Overdue returns report (Project Scope 7.1 - Reports)
-- ---------------------------------------------------------------------
CREATE VIEW vw_OverdueReturns AS
SELECT
    ra.AgreementID,
    bk.BookingID,
    v.RegistrationNumber,
    CASE c.CustomerType
        WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName
        WHEN 'Corporate'  THEN cc.CompanyName
    END AS CustomerName,
    c.Phone,
    bk.ReturnDateExpected,
    CURRENT_DATE - bk.ReturnDateExpected AS DaysOverdue
FROM RentalAgreement ra
JOIN Booking bk ON bk.BookingID = ra.BookingID
JOIN Vehicle v ON v.VehicleID = ra.VehicleID
JOIN Customer c ON c.CustomerID = bk.CustomerID
LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
WHERE ra.AgreementStatus = 'Active'
  AND ra.ActualReturnDate IS NULL
  AND CURRENT_DATE > bk.ReturnDateExpected;

-- ---------------------------------------------------------------------
-- 6. Security: a restricted customer view that hides driver's-licence
-- numbers and full addresses so that counter staff (role app_frontdesk)
-- can look up a customer without seeing data only a manager/DBA needs.
-- This is the "restrict access to sensitive data" half of Objective 9.
-- ---------------------------------------------------------------------
CREATE VIEW vw_CustomerDirectory_Restricted AS
SELECT
    c.CustomerID,
    c.CustomerType,
    CASE c.CustomerType
        WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName
        WHEN 'Corporate'  THEN cc.CompanyName
    END AS CustomerName,
    c.Phone,
    c.IsBlacklisted
FROM Customer c
LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID;

-- Full view (licence numbers, email, credit limits) - management/DBA only.
CREATE VIEW vw_CustomerDirectory_Full AS
SELECT
    c.CustomerID, c.CustomerType, c.Email, c.Phone, c.AddressLine,
    c.DateRegistered, c.IsBlacklisted,
    ic.FirstName, ic.LastName, ic.DriverLicenseNumber, ic.LicenseExpiryDate,
    cc.CompanyName, cc.CompanyRegNumber, cc.ContactPersonName, cc.CreditLimit
FROM Customer c
LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID;

-- ---------------------------------------------------------------------
-- Role-based access control (DCL - Lesson 1: GRANT / REVOKE), matching
-- the Justification section's "Improved security" promise and the
-- Target Users table (Customer / Administrator / DBA).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_frontdesk') THEN
        CREATE ROLE app_frontdesk NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_manager') THEN
        CREATE ROLE app_manager NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_dba') THEN
        CREATE ROLE app_dba NOLOGIN;
    END IF;
END $$;

-- Front-desk administrators: operational work only, restricted customer view.
GRANT SELECT, INSERT, UPDATE ON Booking, RentalAgreement, Payment, VehicleInspection TO app_frontdesk;
GRANT SELECT ON vw_VehicleAvailability, vw_CustomerDirectory_Restricted, vw_TodaysBookings TO app_frontdesk;
REVOKE ALL ON vw_CustomerDirectory_Full FROM app_frontdesk;

-- Managers: full reporting access plus the full customer directory.
GRANT SELECT ON vw_VehicleAvailability, vw_BookingsDetail, vw_TodaysBookings,
    vw_FleetUtilization, vw_RevenueByVehicleType, vw_OverdueReturns,
    vw_CustomerDirectory_Full TO app_manager;

-- DBA: full control (schema changes, backups, security), matching the
-- Target Users table description of the Database Administrator role.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_dba;
