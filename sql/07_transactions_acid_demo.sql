-- =====================================================================
-- 07_transactions_acid_demo.sql
-- Applies Lesson 2, Section 4 (Transactions and ACID Properties)
-- directly to VRMS. This file intentionally forces one transaction to
-- fail so its rollback can be observed, so ON_ERROR_STOP is switched
-- off just for this script.
-- =====================================================================


SELECT '--- Current invoice state before the demo ---' AS step;
SELECT InvoiceID, AgreementID, TotalAmount, AmountPaid, InvoiceStatus FROM Invoice ORDER BY InvoiceID;

-- ---------------------------------------------------------------------
-- SUCCESSFUL TRANSACTION
-- Recording a payment and updating the related invoice must happen
-- together: a payment that is "received" but never reflected on the
-- invoice (or vice-versa) would corrupt the accounts, exactly like the
-- Lesson 2 bank-transfer example. Both statements are grouped in one
-- transaction and COMMITted together.
-- ---------------------------------------------------------------------
BEGIN;

    -- Petrus Nghixulifwa's invoice (SUV, Scenario B) was left
    -- PartiallyPaid; he now comes back and settles the outstanding
    -- late-return penalty in full.
    INSERT INTO Payment (AgreementID, Amount, PaymentMethod, PaymentType)
    SELECT i.AgreementID, i.TotalAmount - i.AmountPaid, 'EFT', 'Penalty'
    FROM Invoice i
    JOIN RentalAgreement ra ON ra.AgreementID = i.AgreementID
    JOIN Booking bk ON bk.BookingID = ra.BookingID
    JOIN Customer c ON c.CustomerID = bk.CustomerID
    WHERE c.Email = 'petrus.nghixulifwa@example.com';

    UPDATE Invoice
       SET AmountPaid = TotalAmount, InvoiceStatus = 'Paid'
     WHERE AgreementID = (
        SELECT ra.AgreementID
        FROM RentalAgreement ra
        JOIN Booking bk ON bk.BookingID = ra.BookingID
        JOIN Customer c ON c.CustomerID = bk.CustomerID
        WHERE c.Email = 'petrus.nghixulifwa@example.com'
     );

COMMIT;

SELECT '--- After the successful, committed transaction ---' AS step;
SELECT InvoiceID, AgreementID, TotalAmount, AmountPaid, InvoiceStatus FROM Invoice ORDER BY InvoiceID;

-- ---------------------------------------------------------------------
-- FAILED TRANSACTION - demonstrates ATOMICITY
-- The first statement below would succeed on its own. The second
-- statement is deliberately invalid (CK_Payment_Amount forbids a
-- zero/negative amount). Because both statements are inside the same
-- transaction, PostgreSQL guarantees that if ANY statement fails, NONE
-- of the transaction's changes are kept - the first INSERT is rolled
-- back too, even though it was individually valid.
-- ---------------------------------------------------------------------
BEGIN;

    INSERT INTO Payment (AgreementID, Amount, PaymentMethod, PaymentType)
    VALUES (1, 100.00, 'Cash', 'Refund');   -- valid on its own

    INSERT INTO Payment (AgreementID, Amount, PaymentMethod, PaymentType)
    VALUES (1, -50.00, 'Cash', 'Refund');   -- violates CK_Payment_Amount -> aborts the transaction

ROLLBACK;

SELECT '--- After the failed transaction was rolled back: the valid N$100 refund above was NOT kept ---' AS step;
SELECT COUNT(*) AS payments_for_agreement_1 FROM Payment WHERE AgreementID = 1;

-- ---------------------------------------------------------------------
-- ISOLATION - setting an explicit isolation level for a reporting query
-- that must see a perfectly consistent snapshot even while other staff
-- are actively recording bookings and payments.
-- ---------------------------------------------------------------------
BEGIN ISOLATION LEVEL REPEATABLE READ;
    SELECT '--- Reporting snapshot taken under REPEATABLE READ ---' AS step;
    SELECT COUNT(*) AS total_agreements FROM RentalAgreement;
COMMIT;


