# ERP-888 summary

Owner Current now includes a `Ghi nhận chủ rút tiền` dialog backed by a dedicated canonical banking
command. One mutation records the negative bank/cash transaction, balanced posted Owner Current journal,
canonical evidence, audit and outbox data. The confirmed settlement read model uses the evidence link
instead of guessing from descriptions or journal IDs.
