const response = await fetch("http://localhost:3000/matter-exports", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    matterId: "MAT-2026-0142",
    clientReference: "CLIENT-8841",
    intakeCompletedAt: "2026-09-20T09:00:00.000Z",
    signedDocument: {
      title: "Engagement letter",
      deliveredAt: "2026-09-21T11:30:00.000Z",
    },
    deadlines: [
      { label: "Disclosure response", dueAt: "2026-10-05T17:00:00.000Z", followedUpAt: null },
      { label: "Client identity review", dueAt: "2026-09-25T17:00:00.000Z", followedUpAt: "2026-09-24T08:00:00.000Z" },
    ],
  }),
});

console.log(JSON.stringify(await response.json(), null, 2));
