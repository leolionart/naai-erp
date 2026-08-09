# ERP-860 acceptance

- Kanban project cards contain no lifecycle dropdown.
- Dragging a card sends the canonical project lifecycle PATCH.
- A successful update moves the card to the target column.
- A failed update retains the card in its prior column and shows the API error.
- Project profile navigation remains available from every card.
