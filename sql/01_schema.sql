-- =====================================================================
-- VEHICLE RENTAL MANAGEMENT SYSTEM (VRMS) - SwiftDrive Vehicle Rentals
-- Database Development 2 - ITCL
-- 01_schema.sql : Data Definition Language (DDL)
--
-- Applies Lesson 1 (relational model, keys) and Lesson 2 (the four
-- types of data integrity: Entity, Referential, Domain, User-defined)
-- Every table has a single-column surrogate primary key (entity
-- integrity), every relationship is enforced with a named FOREIGN KEY
-- (referential integrity), every business-restricted value is enforced
-- with CHECK / NOT NULL / UNIQUE (domain integrity). User-defined
-- integrity (business rules) is implemented later with triggers in
-- 03_functions_triggers.sql.
-- =====================================================================

-- Clean slate (safe to re-run during development/marking)
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ---------------------------------------------------------------------
-- 1. BRANCH
-- ---------------------------------------------------------------------
CREATE TABLE Branch (
    BranchID        SERIAL          NOT NULL,
    BranchName      VARCHAR(60)     NOT NULL,
    AddressLine     VARCHAR(120)    NOT NULL,
    City            VARCHAR(60)     NOT NULL,
    Phone           VARCHAR(20)     NOT NULL,
    IsHeadOffice    BOOLEAN         NOT NULL DEFAULT FALSE,
    CONSTRAINT PK_Branch PRIMARY KEY (BranchID),
    CONSTRAINT UQ_Branch_Name UNIQUE (BranchName)
);

-- ---------------------------------------------------------------------
-- 2. VEHICLE CATEGORY  (Economy, SUV, Luxury, Van, Truck ...)
-- ---------------------------------------------------------------------
CREATE TABLE VehicleCategory (
    CategoryID      SERIAL          NOT NULL,
    CategoryName    VARCHAR(30)     NOT NULL,
    DailyRate       NUMERIC(10,2)   NOT NULL,
    DepositAmount   NUMERIC(10,2)   NOT NULL,
    CONSTRAINT PK_VehicleCategory PRIMARY KEY (CategoryID),
    CONSTRAINT UQ_Category_Name UNIQUE (CategoryName),
    CONSTRAINT CK_Category_DailyRate CHECK (DailyRate > 0),
    CONSTRAINT CK_Category_Deposit CHECK (DepositAmount >= 0)
);

-- ---------------------------------------------------------------------
-- 3. VEHICLE
-- Domain integrity: Status restricted to a fixed list (CHECK), Odometer
-- cannot be negative, RegistrationNumber must be unique across the fleet.
-- ---------------------------------------------------------------------
CREATE TABLE Vehicle (
    VehicleID           SERIAL          NOT NULL,
    RegistrationNumber  VARCHAR(15)     NOT NULL,
    CategoryID          INT             NOT NULL,
    BranchID            INT             NOT NULL,
    Make                VARCHAR(30)     NOT NULL,
    Model               VARCHAR(30)     NOT NULL,
    ManufactureYear     SMALLINT        NOT NULL,
    Odometer            INT             NOT NULL DEFAULT 0,
    Status              VARCHAR(15)     NOT NULL DEFAULT 'Available',
    DateAcquired         DATE            NOT NULL DEFAULT CURRENT_DATE,
    CONSTRAINT PK_Vehicle PRIMARY KEY (VehicleID),
    CONSTRAINT UQ_Vehicle_RegNo UNIQUE (RegistrationNumber),
    CONSTRAINT FK_Vehicle_Category FOREIGN KEY (CategoryID)
        REFERENCES VehicleCategory (CategoryID) ON DELETE RESTRICT,
    CONSTRAINT FK_Vehicle_Branch FOREIGN KEY (BranchID)
        REFERENCES Branch (BranchID) ON DELETE RESTRICT,
    CONSTRAINT CK_Vehicle_Odometer CHECK (Odometer >= 0),
    CONSTRAINT CK_Vehicle_Year CHECK (ManufactureYear BETWEEN 1990 AND 2100),
    CONSTRAINT CK_Vehicle_Status CHECK (Status IN
        ('Available','Rented','Maintenance','OutOfService'))
);

-- ---------------------------------------------------------------------
-- 4. CUSTOMER (supertype)  +  INDIVIDUAL / CORPORATE (subtypes)
-- Modelled as supertype/subtype tables (1:1) instead of one wide table
-- with many nullable columns. This keeps every stored attribute
-- applicable to the row it belongs to, which is the normalisation
-- principle behind 2NF/3NF: no attribute should depend on "which kind
-- of customer this is" rather than on the whole key.
-- ---------------------------------------------------------------------
CREATE TABLE Customer (
    CustomerID      SERIAL          NOT NULL,
    CustomerType    VARCHAR(10)     NOT NULL,
    Email           VARCHAR(100)    NOT NULL,
    Phone           VARCHAR(20)     NOT NULL,
    AddressLine     VARCHAR(120)    NOT NULL,
    DateRegistered  DATE            NOT NULL DEFAULT CURRENT_DATE,
    IsBlacklisted   BOOLEAN         NOT NULL DEFAULT FALSE,
    CONSTRAINT PK_Customer PRIMARY KEY (CustomerID),
    CONSTRAINT UQ_Customer_Email UNIQUE (Email),
    CONSTRAINT CK_Customer_Type CHECK (CustomerType IN ('Individual','Corporate')),
    CONSTRAINT CK_Customer_Email_Format CHECK (Email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE TABLE IndividualCustomer (
    CustomerID          INT             NOT NULL,
    FirstName           VARCHAR(50)     NOT NULL,
    LastName             VARCHAR(50)     NOT NULL,
    DriverLicenseNumber VARCHAR(20)     NOT NULL,
    LicenseExpiryDate   DATE            NOT NULL,
    DateOfBirth         DATE            NOT NULL,
    CONSTRAINT PK_IndividualCustomer PRIMARY KEY (CustomerID),
    CONSTRAINT FK_Individual_Customer FOREIGN KEY (CustomerID)
        REFERENCES Customer (CustomerID) ON DELETE CASCADE,
    CONSTRAINT UQ_Individual_License UNIQUE (DriverLicenseNumber),
    CONSTRAINT CK_Individual_Age CHECK (DateOfBirth <= CURRENT_DATE - INTERVAL '18 years')
);

CREATE TABLE CorporateCustomer (
    CustomerID          INT             NOT NULL,
    CompanyName         VARCHAR(100)    NOT NULL,
    CompanyRegNumber    VARCHAR(30)     NOT NULL,
    ContactPersonName   VARCHAR(100)    NOT NULL,
    CreditLimit         NUMERIC(10,2)   NOT NULL DEFAULT 0,
    CONSTRAINT PK_CorporateCustomer PRIMARY KEY (CustomerID),
    CONSTRAINT FK_Corporate_Customer FOREIGN KEY (CustomerID)
        REFERENCES Customer (CustomerID) ON DELETE CASCADE,
    CONSTRAINT UQ_Corporate_RegNumber UNIQUE (CompanyRegNumber),
    CONSTRAINT CK_Corporate_CreditLimit CHECK (CreditLimit >= 0)
);

-- Authorised drivers nominated by a corporate account (a corporate
-- customer may have several employees who are allowed to drive; this
-- avoids a repeating group inside CorporateCustomer -> 1NF).
CREATE TABLE AuthorizedDriver (
    DriverID            SERIAL          NOT NULL,
    CustomerID          INT             NOT NULL,
    FullName            VARCHAR(100)    NOT NULL,
    DriverLicenseNumber VARCHAR(20)     NOT NULL,
    LicenseExpiryDate   DATE            NOT NULL,
    CONSTRAINT PK_AuthorizedDriver PRIMARY KEY (DriverID),
    CONSTRAINT FK_Driver_Corporate FOREIGN KEY (CustomerID)
        REFERENCES CorporateCustomer (CustomerID) ON DELETE CASCADE,
    CONSTRAINT UQ_Driver_License UNIQUE (DriverLicenseNumber)
);

-- ---------------------------------------------------------------------
-- 5. STAFF  (Administrators; a separate Role/AppUser pair implements
--    authentication + role-based access, per Justification section of
--    the proposal: "Improved security")
-- ---------------------------------------------------------------------
CREATE TABLE Staff (
    StaffID         SERIAL          NOT NULL,
    BranchID        INT             NOT NULL,
    FullName        VARCHAR(100)    NOT NULL,
    Email           VARCHAR(100)    NOT NULL,
    JobRole         VARCHAR(20)     NOT NULL,
    HireDate        DATE            NOT NULL DEFAULT CURRENT_DATE,
    CONSTRAINT PK_Staff PRIMARY KEY (StaffID),
    CONSTRAINT UQ_Staff_Email UNIQUE (Email),
    CONSTRAINT FK_Staff_Branch FOREIGN KEY (BranchID)
        REFERENCES Branch (BranchID) ON DELETE RESTRICT,
    CONSTRAINT CK_Staff_Role CHECK (JobRole IN ('Administrator','DBA','Manager'))
);

CREATE TABLE AppRole (
    RoleID          SERIAL          NOT NULL,
    RoleName        VARCHAR(30)     NOT NULL,
    Description     VARCHAR(150)    NOT NULL,
    CONSTRAINT PK_AppRole PRIMARY KEY (RoleID),
    CONSTRAINT UQ_AppRole_Name UNIQUE (RoleName)
);

CREATE TABLE AppUser (
    UserID          SERIAL          NOT NULL,
    StaffID         INT             NOT NULL,
    RoleID          INT             NOT NULL,
    Username        VARCHAR(30)     NOT NULL,
    PasswordHash    VARCHAR(255)    NOT NULL,
    IsActive        BOOLEAN         NOT NULL DEFAULT TRUE,
    CONSTRAINT PK_AppUser PRIMARY KEY (UserID),
    CONSTRAINT UQ_AppUser_Username UNIQUE (Username),
    CONSTRAINT UQ_AppUser_Staff UNIQUE (StaffID),
    CONSTRAINT FK_AppUser_Staff FOREIGN KEY (StaffID)
        REFERENCES Staff (StaffID) ON DELETE CASCADE,
    CONSTRAINT FK_AppUser_Role FOREIGN KEY (RoleID)
        REFERENCES AppRole (RoleID) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------
-- 6. BOOKING  (a request for a vehicle category at a branch, for a date
--    range - the specific vehicle is only assigned once confirmed)
-- ---------------------------------------------------------------------
CREATE TABLE Booking (
    BookingID           INT             NOT NULL,   -- populated via booking_ref_seq, see 02_sequences.sql
    CustomerID          INT             NOT NULL,
    CategoryID          INT             NOT NULL,
    BranchID            INT             NOT NULL,
    PickupDate          DATE            NOT NULL,
    ReturnDateExpected  DATE            NOT NULL,
    BookingStatus       VARCHAR(15)     NOT NULL DEFAULT 'Requested',
    DateCreated         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT PK_Booking PRIMARY KEY (BookingID),
    CONSTRAINT FK_Booking_Customer FOREIGN KEY (CustomerID)
        REFERENCES Customer (CustomerID) ON DELETE RESTRICT,
    CONSTRAINT FK_Booking_Category FOREIGN KEY (CategoryID)
        REFERENCES VehicleCategory (CategoryID) ON DELETE RESTRICT,
    CONSTRAINT FK_Booking_Branch FOREIGN KEY (BranchID)
        REFERENCES Branch (BranchID) ON DELETE RESTRICT,
    CONSTRAINT CK_Booking_Dates CHECK (ReturnDateExpected > PickupDate),
    CONSTRAINT CK_Booking_Status CHECK (BookingStatus IN
        ('Requested','Confirmed','CheckedOut','Completed','Cancelled'))
);

-- ---------------------------------------------------------------------
-- 7. RENTAL AGREEMENT  (1:1 with Booking once a vehicle is assigned)
-- ---------------------------------------------------------------------
CREATE TABLE RentalAgreement (
    AgreementID         INT             NOT NULL,   -- populated via agreement_id_seq
    BookingID           INT             NOT NULL,
    VehicleID           INT             NOT NULL,
    StaffID             INT             NOT NULL,
    ActualPickupDate    DATE            NOT NULL,
    OdometerOut         INT             NOT NULL,
    ActualReturnDate    DATE,
    OdometerIn          INT,
    DailyRateApplied    NUMERIC(10,2)   NOT NULL,
    DepositPaid         NUMERIC(10,2)   NOT NULL DEFAULT 0,
    AgreementStatus     VARCHAR(10)     NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_RentalAgreement PRIMARY KEY (AgreementID),
    CONSTRAINT UQ_Agreement_Booking UNIQUE (BookingID),
    CONSTRAINT FK_Agreement_Booking FOREIGN KEY (BookingID)
        REFERENCES Booking (BookingID) ON DELETE RESTRICT,
    CONSTRAINT FK_Agreement_Vehicle FOREIGN KEY (VehicleID)
        REFERENCES Vehicle (VehicleID) ON DELETE RESTRICT,
    CONSTRAINT FK_Agreement_Staff FOREIGN KEY (StaffID)
        REFERENCES Staff (StaffID) ON DELETE RESTRICT,
    CONSTRAINT CK_Agreement_OdometerOut CHECK (OdometerOut >= 0),
    CONSTRAINT CK_Agreement_OdometerIn CHECK (OdometerIn IS NULL OR OdometerIn >= OdometerOut),
    CONSTRAINT CK_Agreement_ReturnAfterPickup CHECK (ActualReturnDate IS NULL OR ActualReturnDate >= ActualPickupDate),
    CONSTRAINT CK_Agreement_DailyRate CHECK (DailyRateApplied > 0),
    CONSTRAINT CK_Agreement_Status CHECK (AgreementStatus IN ('Active','Closed'))
);

-- Pickup / return condition reports (avoids a repeating group of
-- inspection notes being crammed into RentalAgreement -> 1NF).
CREATE TABLE VehicleInspection (
    InspectionID        SERIAL          NOT NULL,
    AgreementID         INT             NOT NULL,
    InspectionType      VARCHAR(10)     NOT NULL,
    InspectionDate      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ConditionNotes      VARCHAR(255),
    DamageFound         BOOLEAN         NOT NULL DEFAULT FALSE,
    CONSTRAINT PK_VehicleInspection PRIMARY KEY (InspectionID),
    CONSTRAINT FK_Inspection_Agreement FOREIGN KEY (AgreementID)
        REFERENCES RentalAgreement (AgreementID) ON DELETE CASCADE,
    CONSTRAINT CK_Inspection_Type CHECK (InspectionType IN ('Pickup','Return'))
);

-- ---------------------------------------------------------------------
-- 8. PAYMENT
-- ---------------------------------------------------------------------
CREATE TABLE Payment (
    PaymentID       SERIAL          NOT NULL,
    AgreementID     INT             NOT NULL,
    PaymentDate     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Amount          NUMERIC(10,2)   NOT NULL,
    PaymentMethod   VARCHAR(10)     NOT NULL,
    PaymentType     VARCHAR(15)     NOT NULL,
    CONSTRAINT PK_Payment PRIMARY KEY (PaymentID),
    CONSTRAINT FK_Payment_Agreement FOREIGN KEY (AgreementID)
        REFERENCES RentalAgreement (AgreementID) ON DELETE RESTRICT,
    CONSTRAINT CK_Payment_Amount CHECK (Amount > 0),
    CONSTRAINT CK_Payment_Method CHECK (PaymentMethod IN ('Cash','Card','EFT')),
    CONSTRAINT CK_Payment_Type CHECK (PaymentType IN ('Deposit','RentalFee','Penalty','Refund'))
);

-- ---------------------------------------------------------------------
-- 9. INVOICE  +  INVOICE LINE
-- ---------------------------------------------------------------------
CREATE TABLE Invoice (
    InvoiceID       INT             NOT NULL,   -- populated via invoice_number_seq
    AgreementID     INT             NOT NULL,
    InvoiceDate     DATE            NOT NULL DEFAULT CURRENT_DATE,
    TotalAmount     NUMERIC(10,2)   NOT NULL,
    AmountPaid      NUMERIC(10,2)   NOT NULL DEFAULT 0,
    InvoiceStatus   VARCHAR(15)     NOT NULL DEFAULT 'Unpaid',
    CONSTRAINT PK_Invoice PRIMARY KEY (InvoiceID),
    CONSTRAINT UQ_Invoice_Agreement UNIQUE (AgreementID),
    CONSTRAINT FK_Invoice_Agreement FOREIGN KEY (AgreementID)
        REFERENCES RentalAgreement (AgreementID) ON DELETE RESTRICT,
    CONSTRAINT CK_Invoice_Total CHECK (TotalAmount >= 0),
    CONSTRAINT CK_Invoice_Status CHECK (InvoiceStatus IN ('Unpaid','PartiallyPaid','Paid'))
);

CREATE TABLE InvoiceLine (
    InvoiceLineID   SERIAL          NOT NULL,
    InvoiceID       INT             NOT NULL,
    Description     VARCHAR(100)    NOT NULL,
    Amount          NUMERIC(10,2)   NOT NULL,
    CONSTRAINT PK_InvoiceLine PRIMARY KEY (InvoiceLineID),
    CONSTRAINT FK_InvoiceLine_Invoice FOREIGN KEY (InvoiceID)
        REFERENCES Invoice (InvoiceID) ON DELETE CASCADE,
    CONSTRAINT CK_InvoiceLine_Amount CHECK (Amount <> 0)
);

-- ---------------------------------------------------------------------
-- Helpful indexes on foreign keys frequently used in joins/reports
-- ---------------------------------------------------------------------
CREATE INDEX IX_Vehicle_Category ON Vehicle (CategoryID);
CREATE INDEX IX_Vehicle_Branch ON Vehicle (BranchID);
CREATE INDEX IX_Booking_Customer ON Booking (CustomerID);
CREATE INDEX IX_Booking_Status ON Booking (BookingStatus);
CREATE INDEX IX_Agreement_Vehicle ON RentalAgreement (VehicleID);
CREATE INDEX IX_Payment_Agreement ON Payment (AgreementID);
