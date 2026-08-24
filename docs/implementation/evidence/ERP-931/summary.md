# ERP-931 summary

Customer cards now show tax ID, linked-project count, email and phone. Project cards now show the
customer name, service/contract context, execution period and budget. Both cards keep status on the
left and actions on the right in a consistent footer.

Project cards also show separate invoiced and collected progress against the contract commitment.
The operating read model now includes approved scope impacts, credit notes, line/allocation project
dimensions and both reconciled-bank and posted-customer-receipt collection paths. Gross settlements
are attributed back to project net revenue so VAT is not presented as project revenue.

Changed files are listed in the ERP-931 task ledger entry. No schema, journal or accounting mutation
behavior was changed.

The repository-wide lint gate also exposed and removed an unused legacy `idList` helper; this was a
no-behavior cleanup required for the release gate.
