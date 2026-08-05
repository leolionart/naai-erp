# GF-TRANSFER-001 manual oracle

The source account sends VND 100,100,000. VND 100,000,000 is transfer principal and VND 100,000 is an explicit bank fee. The destination account receives exactly VND 100,000,000 one day later.

The outgoing leg debits internal-transfer transit for principal, debits bank-fee expense for the explicit fee, and credits the source bank. The incoming leg debits the destination bank and credits transit.

Therefore both journals balance, transit finishes at zero, transfer principal has zero profit-and-loss impact, and only the explicit VND 100,000 fee affects expense.
