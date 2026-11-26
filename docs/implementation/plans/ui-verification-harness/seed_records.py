import json,urllib.request,uuid
B="http://127.0.0.1:3101/api/v1/organizations/org-ui"
def call(m,path,body,tok,extra=None):
    h={"Authorization":"Bearer "+tok,"Content-Type":"application/json","Idempotency-Key":str(uuid.uuid4())}
    h.update(extra or {})
    r=urllib.request.Request(B+path,data=json.dumps(body).encode(),headers=h,method=m)
    try:
        return json.loads(urllib.request.urlopen(r).read())
    except urllib.error.HTTPError as e:
        return {"HTTP":e.code,"body":e.read().decode()[:300]}
exp=lambda i,date,net,vat,purpose:{"id":i,"expenseClass":"invoice_backed","payeePartyId":"SUP","expenseDate":date,"businessPurpose":purpose,"currency":"VND","netMinor":str(net),"vatMinor":str(vat),"grossMinor":str(net+vat),"counterAccountCode":"3388-OWNER","evidenceChecklist":{"invoice":True},"externalReference":{"system":"paperless-ngx","externalId":"pl-"+i},"lines":[{"description":purpose,"netMinor":str(net),"vatMinor":str(vat),"grossMinor":str(net+vat),"postingAccountCode":"642-OPEX","expenseCategoryCode":"OFFICE",**({"vatAccountCode":"1331-VAT"} if vat else {}),"allocations":[{"id":i+"-a","amountMinor":str(net),"dimensions":{"costCenter":"ADMIN"}}]}]}
print("posted expense", call("POST","/expenses",exp("exp-posted","2026-11-10",1000000,100000,"Thuê văn phòng"),"ui-owner-token"))
print("draft expense", call("POST","/expenses",exp("exp-draft","2026-11-12",500000,0,"Văn phòng phẩm"),"ui-int-token"))
inv={"id":"inv-posted","type":"sales_invoice","documentNumber":"INV-001","series":"AA","fiscalYear":2026,"partyId":"CLIENT","documentDate":"2026-11-11","dueDate":"2026-12-11","currency":"VND","netMinor":"2000000","taxMinor":"200000","grossMinor":"2200000","controlAccountCode":"131-AR","lines":[{"description":"Dịch vụ thiết kế","quantity":"1","unitPriceMinor":"2000000","netMinor":"2000000","taxMinor":"200000","grossMinor":"2200000","primaryAccountCode":"511-REV","taxAccountCode":"3331-VAT-OUT","categoryCode":"SERVICE","allocations":[{"id":"inv-a","amountMinor":"2000000","dimensions":{"projectId":"PRJ"}}]}]}
print("posted sales", call("POST","/commercial-documents",inv,"ui-owner-token"))
print("draft purchase", call("POST","/commercial-documents/purchase-invoice-ingestion",{"supplierTaxId":"0312345678","supplierName":"Nhà cung cấp B","documentNumber":"PUR-001","documentDate":"2026-11-13","category":"OFFICE","description":"Mực in","grossMinor":"330000","externalReference":{"system":"paperless-ngx","externalId":"pl-pur-1"}},"ui-int-token"))
