## Inspiration

The pork industry moves thousands of animals every day, but logistics decisions are still often made with spreadsheets, experience and guesswork.  
We saw that optimizing **only distance** usually leads to using more trucks than necessary, which is economically and environmentally inefficient.  
PigChain was born from the idea of combining **economic optimization**, **data visualization** and **traceability** to help producers make better, more profitable routing decisions.

## What it does

PigChain Logistics is an end‑to‑end system for **route optimization and traceability** in the pig industry.  
The backend exposes a **FastAPI** service that solves an **economic Capacitated Vehicle Routing Problem (CVRP)** with Google OR‑Tools, maximizing **net profit** instead of just minimizing kilometers.  
The frontend (React + TypeScript) lets farmers and slaughterhouses:
- Configure farms, slaughterhouses and capacities  
- Simulate collection plans over several days  
- Visualize optimized routes on an interactive Google Map  
- See key financial metrics such as net profit, cost per pig, trucks used per day and annual savings.

## How we built it

We designed a Python 3.11+ backend with FastAPI that models each farm, vehicle and day as part of an economic VRP.  
Using **Google OR‑Tools**, we defined a custom objective function that combines fuel cost and the fixed cost per truck per week, so consolidating routes is rewarded.  
The API returns optimized routes plus rich financial metrics, which the React + Vite frontend consumes via REST, displaying them with Google Maps and a clean UI styled with TailwindCSS.  
Everything is containerized with Docker for easy local development and deployment.

## Challenges we ran into

- **Economic vs. distance optimization**: It was non‑trivial to encode the real‑world cost structure (fixed cost per truck, variable fuel, revenue per pig) into a single objective function that OR‑Tools could handle efficiently.  
- **Scalability of the search space**: With dozens of farms, several trucks and multi‑day horizons, the number of combinations explodes; we had to tune heuristics and fallback strategies to keep responses in the 3–15 second range.  
- **Usability for non‑technical users**: Farmers and logistics managers don’t think in terms of constraints or nodes, so we iterated on the UI to make configuration and interpretation of results intuitive.  
- **Integration and debugging**: Keeping backend, optimization logic and map visualization in sync (especially when changing input parameters) required careful testing and logging.

## Accomplishments that we're proud of

- We built a **production‑ready API** with documentation, tests and clear integration guides.  
- We achieved **15–35% cost savings** in realistic scenarios (e.g., 6 farms over 15 days), mainly by reducing the average number of trucks per day.  
- The system provides transparent **financial metrics** (net profit, cost breakdown, ROI estimates) that make the optimization understandable and trustworthy for stakeholders.  
- We delivered a **full stack solution** (backend + frontend + docs + Docker) in a short time, ready to be deployed on common platforms like Railway or Vercel.

## What we learned

- That **optimizing only distance is almost never economically optimal** when trucks have high fixed costs—removing one truck can compensate thousands of extra kilometers.  
- How to model real business rules (capacities, planning horizons, revenues and costs) as an **economic VRP** and solve it with OR‑Tools.  
- The importance of good **developer experience**: clear documentation, test suites and containerization dramatically speed up iteration.  
- That **visualization matters**: interactive maps and clear summaries make complex optimization results much easier to adopt in real operations.

## What's next for PigChain Logistics

In the short term, we want to support **multiple slaughterhouses**, **time windows**, and deeper integration with **Google Maps Directions API** for more realistic travel times.  
We also plan to add **persistent storage** and **user authentication** so real customers can use the platform securely in production.  
For future versions, we envision **machine learning models** to predict availability, **real‑time re‑optimization**, advanced analytics dashboards and **blockchain‑based traceability** to close the loop from farm to fork.
