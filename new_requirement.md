AI-NATIVE PROFICIENCY ASSESSMENT

Requirement Change

Complete Change Requirement | Priority Partial Fulfilment

Change request
Implement this change on top of your Stage 1 solution. This is a complete change requirement; no separate discovery/clarification release will follow.

Technical & Submission Rules

Application stack: React + Node.js. You may choose your preferred libraries, project structure and implementation approach.

A simple functional UI is sufficient. UI sophistication is not part of the assessment.

Build and run the solution locally. No hosting or deployment is required.

Use your own SQL Server database named <EmployeeCode>\_OrderFulfilment.

Use Git-based version control and retain the required stage checkpoint.

You may use AI throughout, but you are responsible for understanding, validating, testing and explaining your solution.

Retain your AI interaction/history, Git history, database scripts, tests/results and relevant working artifacts.

Common API Conventions

Use the exact field names and literal status values specified in this document so the solution can be verified consistently.

orderId, customerId, productId and warehouseId are strings. quantity and availableQuantity are integers greater than 0.

promisedDeliveryDate uses YYYY-MM-DD. customerType is exactly "Standard" or "Priority". warehouseId is exactly "WH-A", "WH-B" or "WH-C".

Order status values are exactly "Released", "PartiallyReleased" or "Blocked". reason is null unless the order is Blocked.

Business Change

The business wants to improve fulfilment for Priority customers. Priority orders may now use inventory across multiple warehouses and may be partially released when enough stock is available. Standard-customer behaviour must continue to work.

Complete Change Rules

Standard customers remain unchanged: the full quantity must be available from one warehouse.

Priority customers may combine inventory across WH-A, WH-B and WH-C in that order.

If at least 70% of requested quantity is available, release the available quantity and create one Open backorder for the balance.

Exactly 70% qualifies. If less than 70% is available, Block the order with no allocation and no backorder.

Never allocate more than the requested quantity.

Make the 70% threshold configurable.

Repeated processing of the same Order ID must not create duplicate allocations or backorders; reuse the established result.

Persist Released Quantity, Backordered Quantity, allocations and backorder status.

Preserve all Stage 1 behaviour and update tests accordingly.

API Behaviour

Continue using POST /orders and GET /orders/{orderId} with the same request/response field names defined in Stage 1.

Priority Partial Release Example

Priority order = 100 units; WH-A = 40, WH-B = 35, WH-C = 0 -> Released 75, Backordered 25.

{"orderId":"ORD1002","status":"PartiallyReleased","reason":null,"releasedQuantity":75,"backorderedQuantity":25,"allocations":[{"warehouseId":"WH-A","allocatedQuantity":40},{"warehouseId":"WH-B","allocatedQuantity":35}]}

Stage 2 Submission - CHANGE1

Updated working solution

Database changes/scripts

Updated tests + Stage 1 regression evidence

Git CHANGE1 checkpoint

Updated AI interaction/history evidence and relevant working artifacts
