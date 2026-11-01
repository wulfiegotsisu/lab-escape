# Operation P.A.W.S. — Lab Breakout (v0.5)

An original pixel-inspired, asymmetric **two-player multiplayer escape room**. One player is Pip the Mouse (mechanical clues); the other is Echo the Chameleon (hidden UV clues). Includes 3 cooperative rooms, chat, a progressive hint system, synchronized progress, and a joint timed finale.

## What's new in v0.5

- **Victory sequence:** The final escape now displays animated **VICTORY! FREEDOM!** lettering, broken chains, light rays, falling confetti, and a replay-celebration button. Results remain visible and can be viewed on desktop or mobile.
- **No Secret Notes panel:** The left column shows only the mission objective and steps. To recall clues, tap the original object again and inspect its illustration; the game does not record the answer in a text note.
- **Six mini-interactions before evidence appears:** The mouse connects four color-coded wires, restores torn protocol pages in order, and solves a power-load calculation. The chameleon cranks the UV generator, whisks a spectral sample, and calibrates a three-band ghost signal. Each task works with mouse clicks or phone taps (no precision dragging). The original cooperative puzzle solutions and character-specific evidence stay the same.
- **Less interruptive puzzle inputs:** Selecting a reagent updates the mixer queue in place. Correct keypad and mixer inputs advance shared progress without an intermediate success popup; the elaborate success animation is reserved for the final escape.
- **Original spooky background soundtrack:** A low, eerie ambient motif is synthesized by the browser with Web Audio. **Music On / Off** and **Sound On / Off** are separate controls with saved settings. Most browsers require one click/tap before audio can start; no copyrighted game soundtrack or music files are included.
- **Validated:** The two-player progression test, six interaction tests, and desktop/mobile browser checks passed. Room state is still temporary (server memory only).

## Windows — play locally

1. Install [Python 3](https://www.python.org/downloads/) (tick **Add python.exe to PATH** during setup). If you already have Python, skip.
2. Extract this ZIP. Double-click **start_windows.bat** inside the extracted folder.
3. Keep the black terminal window open. You should see `Operation P.A.W.S. running at http://localhost:8000`.
4. Visit **http://localhost:8000** in your web browser.
5. Create a room as Pip. Open a second browser (an incognito window works) at the same URL and join with the displayed five-character room code as Echo. Both players can chat and play together.

Keep the terminal window open while playing. To stop, close the window or press Ctrl+C.

## Mac/Linux

Open Terminal in this folder and run `bash start_mac_linux.sh`. Then visit http://localhost:8000.

## Play on two physical devices on the same Wi-Fi

1. Start the server on the host computer.
2. Find that computer's local IPv4 address: on Windows open Command Prompt, run `ipconfig`, and look for `IPv4 Address` under the active Wi-Fi adapter (example: `192.168.1.23`).
3. From another device on **the same Wi-Fi**, open `http://YOUR-PC-IP:8000` (example: `http://192.168.1.23:8000`). Allow Python through Windows Firewall on **Private networks** if prompted.
4. Use the room code displayed on the host device to join.

`localhost` points to the current device, so it cannot be used from another physical device. For play over the internet from different networks, this project must be deployed to a public web host with support for Python `aiohttp` and WebSockets.

## How to play

- Two players join the same room; the host presses **Begin escape**.
- Each player clicks their own glowing investigation hotspot, completes a small mechanism puzzle, and learns **only their own clue**. Share information through chat or voice.
- **Room 1:** Pip inspects the vent wiring, Echo reveals the color order and enters the door code.
- **Room 2:** Pip discovers a reagent-order protocol, Echo sees hidden labels. Pip uses the mixer to input the correct vial sequence.
- **Room 3:** Pip maps security wires, Echo reveals the direction order. Pip enters a power code. Then **both** players must pull their individual emergency levers within 12 seconds.
- Earn the victory screen together. Hints are available if you get stuck.

## Technical notes and limitations

- Python `aiohttp` WebSockets provide real synchronized game state; the server alone checks answers and authorizes each role's actions.
- Private clues are sent **only** to the corresponding character, not both clients.
- Refreshing a tab restores its identity using session storage. A room code can be shared via a link.
- MVP state lives in server memory. Restarting the server resets rooms, and the game currently supports exactly 2 players per room.
- Pixel-inspired visuals are original HTML/CSS/Canvas art, not copies of the provided reference images.
- No login, third-party APIs, or database are needed for the local MVP.
