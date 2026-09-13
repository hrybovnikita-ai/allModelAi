# Use AllModelAI on your phone or tablet

AllModelAI runs in the background on your Windows computer. Close the code editor and startup window, then continue asking questions from a phone or tablet on the same home Wi-Fi. Keep the computer on, awake, and connected to the internet.

## Start chatting

1. Double-click `start-home-server.bat`. It builds the latest website and starts a hidden server on port 5055. Node.js and the project dependencies must be installed; provider keys continue to come from `backend/.env`.
2. Open `HOME-ACCESS.txt`, which the launcher creates with your computer's network addresses.
3. Connect your phone or tablet to the same home network and open the listed address in Safari or Chrome, for example `http://192.168.1.25:5055/chat`. Do not enter `localhost` on the phone: that means the phone itself.
4. Sign in with your AllModelAI account and bookmark the address. Chats saved to this account are available on other devices using this server.
5. Close the editor and startup window. The app keeps running. Double-click `stop-home-server.bat` to stop it.

After restarting Windows, run the start shortcut again. To load code changes, stop and restart the home server. If the computer's Wi-Fi address changes, run the start shortcut again to refresh `HOME-ACCESS.txt`. The development server on port 5050 is separate; use port 5055 on all devices for this background session.

## Connection help

- Both devices must use the same home network. Guest Wi-Fi may block access between devices.
- Set your trusted home network to **Private** in Windows network settings.
- Allow incoming TCP port **5055** in Windows Defender Firewall for the **Private** profile and **Local subnet** only. An administrator can run this once in PowerShell:

```powershell
New-NetFirewallRule -DisplayName 'AllModelAI Home Wi-Fi' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5055 -Profile Private -RemoteAddress LocalSubnet
```

- Keep the computer awake while you chat. The launcher does not change your power settings.
- Startup errors are in `.runtime/home-server-error.log`. Check status with `powershell -NoProfile -File scripts/home-server.ps1 -Action status` from this folder.

This mode uses HTTP on your trusted home network. It does not work from mobile data or while the computer is off. Installing a full PWA requires HTTPS; a browser bookmark works for home Wi-Fi. Cloud hosting is a separate option in `README.md`.

## Accompanying text

**Chat from your phone or tablet**

Start AllModelAI on your home computer, connect your phone or tablet to the same Wi-Fi, and open the address shown in HOME-ACCESS.txt. Sign in and ask your questions as usual. You can close the code editor: the app runs in the background. Keep the computer awake and online while you chat.
