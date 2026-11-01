# Publish Operation P.A.W.S. with Render

The app serves its HTML/CSS/JS and Python aiohttp WebSocket backend from one web service.

1. Upload the *contents* of this archive (not the parent folder) into a GitHub repository.
2. In Render, choose New > Blueprint and connect that repository. Render reads render.yaml.
3. Approve the plan and deploy. Copy the resulting https://...onrender.com URL.
4. Open the public URL on two devices, create a room on one, and join on the second.

Or make a regular Python Web Service with build `pip install -r requirements.txt`, start `python server.py`, and health check `/api/ping`.

Note: Rooms are held in memory and are lost on server restart, redeploy, or free-tier spin-down. Deploy as a single instance. Active sessions should be tested before sharing. No account or installation is required for players.
