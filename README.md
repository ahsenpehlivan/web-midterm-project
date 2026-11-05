# Transport Management Web Demo

![JavaScript](https://img.shields.io/badge/JavaScript-Browser%20App-F7DF1E?logo=javascript&logoColor=black) ![HTML](https://img.shields.io/badge/HTML%20%26%20CSS-Frontend-E34F26?logo=html5&logoColor=white)

A browser-based logistics coursework project with customer and administrator views. It models shipment creation and tracking alongside fleet, container, inventory, and financial dashboards.

## What you can explore

| Area | Pages |
| --- | --- |
| Customer flow | [Home](home.html), [create shipment](create_shipment.html), [track shipments](track_shipments.html) |
| Administration | [Admin](admin.html), [fleet](fleet_management.html), [inventory](inventory_dashboard.html), [financial dashboard](financial_dashboard.html) |

The JavaScript modules use `localStorage` for demo state and load initial JSON from [`seed/`](seed/). This is a **client-side prototype**; the data and login flow are not a production backend.

## Run locally

From the repository root:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000/home.html](http://localhost:8000/home.html). Use a local HTTP server so the JSON seed files load correctly.

## Stack

HTML, CSS, and vanilla JavaScript. No build step is required.

> Built as a web development midterm project.
