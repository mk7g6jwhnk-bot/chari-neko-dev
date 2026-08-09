# KEIRIN-0.5.16 fast result path

- Result-only UI calls use Railway `/keirin/result` as the primary path.
- The Netlify proxy no longer calls the heavy `/keirin/race` fallback after ordinary result-service failures.
- `/keirin/race` fallback is used only when `/keirin/result` is missing (404/405), for old Railway compatibility.
- Result fetch timeout is bounded so a result-only click does not occupy the Netlify function through two long browser calls.
- Prediction and purchase logic are unchanged.
