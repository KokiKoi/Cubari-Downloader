# Cubari Downloader

A desktop app to easily download and organize manga from Cubari libraries. Supports automatic .cbz packaging and a local library for tracking your series.

## Features
- **Universal Cubari Support:** Automatically decodes Base64 GitHub raw paths, standard Gists, and direct JSON links.
- **Local Library System:** Save your favorite series to a persistent local library for quick access. Includes a one-click "Latest" button to instantly rip the newest chapter.
- **Custom Packaging:** Choose between downloading raw image folders or automatically compiling into `.cbz` archives.

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/Cubari-Downloader.git](https://github.com/your-username/Cubari-Downloader.git)
   cd Cubari-Downloader
   ```

2. **Install the dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the app:**
   ```bash
   python main.py
   ```

## Compiling to an Executable (.exe)
To turn this into a standalone desktop application, you can use PyInstaller.

1. Install PyInstaller: 
   ```bash
   pip install pyinstaller
   ```
2. Run the build command via Eel:
   ```bash
   python -m eel main.py web --onefile --noconsole --name "Cubari Downloader" --icon "web/favicon.ico"
   ```
3. Your compiled `.exe` will be located in the `dist/` folder!
