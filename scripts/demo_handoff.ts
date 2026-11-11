const response = await fetch("http://localhost:3000/exports/handoff", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    order: { id: "ord_1042", placedAt: "2026-09-17T09:30:00.000Z", status: "fulfilled" },
    seller: {
      name: "Northline Templates",
      assets: [
        { label: "Brand workbook", url: "https://downloads.example.com/workbook.zip" },
        { label: "Font guide", url: "https://downloads.example.com/fonts.pdf" }
      ]
    },
    buyer: {
      email: "buyer@example.com",
      updates: [{ at: "2026-09-17T10:00:00.000Z", note: "Delivery accepted" }]
    }
  })
});

console.log(JSON.stringify(await response.json(), null, 2));
