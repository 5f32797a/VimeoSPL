<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0077B5&height=250&section=header&text=Vimeo%20SPL&fontSize=80&fontColor=ffffff&desc=The%20Architect%20of%20Streaming&descSize=25&animation=fadeIn&fontAlignY=40&descAlignY=60" />

<br/>

<a href="https://git.io/typing-svg">
  <img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=600&size=24&pause=1000&color=00D2FF&center=true&vCenter=true&width=600&lines=Bypass+Restrictions;Unlock+High+Fidelity+Streams;Glassmorphism+Interface;v4.0+Now+Available" alt="Typing SVG" />
</a>

<br/>

[![Version](https://img.shields.io/badge/Version-4.0-00d2ff?style=for-the-badge&logo=vimeo&logoColor=white)](https://github.com/5f32797a/VimeoSPL)
[![License](https://img.shields.io/badge/License-MIT-0077B5?style=for-the-badge)](https://github.com/5f32797a/VimeoSPL/blob/main/LICENSE)
[![Maintenance](https://img.shields.io/badge/Maintained-Yes-004E7A?style=for-the-badge)](https://github.com/5f32797a/VimeoSPL/commits/main)

<br/>

> **"Experience the stream as it was meant to be seen."**
> <br/> A sophisticated userscript that injects a high-performance HLS player into restricted Vimeo & Patreon embeds.

</div>

---

## 💠 Core Architecture

VimeoSPL v4.0 is rebuilt from the ground up to prioritize **stability** and **aesthetics**.

| Component | Status | Description |
| :--- | :---: | :--- |
| **Visual Core** | 🎨 | **Glassmorphism UI**: Blur backdrops (`backdrop-filter`), smooth fade transitions, and a deep blue dark mode. |
| **Access Node** | 🔓 | **Header Injection**: Bypasses privacy settings by emulating valid referrer headers. |
| **Download Engine** | 🚀 | **Separate Streams**: Downloads Raw Video (`.mp4`) and Audio (`.mp4`) independently for 100% success rate. |
| **Input System** | ⌨️ | **Keyboard Driven**: Full hotkey support for power users (Seek, Volume, Fullscreen). |

---

## ⚡ Installation Protocol

### 1. Initialize Environment
You need a userscript manager to inject the core.

| Browser | Recommended Agent |
| :--- | :--- |
| **Chrome / Brave** | [Violentmonkey](https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag) |
| **Firefox** | [Violentmonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/) |

### 2. Deploy Script
Click the terminal button below to install directly.

<div align="center">
  <br/>
  <a href="https://github.com/5f32797a/VimeoSPL/raw/main/vimeo-spl.user.js">
    <img src="https://img.shields.io/badge/INITIALIZE_SPL_v4.0-0077B5?style=for-the-badge&logo=tampermonkey&logoColor=white&labelColor=004E7A" height="60">
  </a>
  <br/><br/>
</div>

---

## 🎮 Interface & Controls

The UI is designed to disappear when you don't need it and provide granular control when you do.

| Command | Key / Action |
| :--- | :--- |
| **Playback** | <kbd>Space</kbd> or Click Center |
| **Fullscreen** | <kbd>F</kbd> |
| **Seek** | <kbd>←</kbd> / <kbd>→</kbd> (5s increments) |
| **Volume** | <kbd>↑</kbd> / <kbd>↓</kbd> or Hover Slider |
| **Download** | Click <kbd>⬇</kbd> Icon in Bar |

---

## 📥 Stream Extraction Logic

To ensure maximum quality and zero corruption, we do not mux in the browser.

```mermaid
graph TD
    A[User Initiates Download] --> B{Select Target}
    B -->|High Quality| C[Video Stream .mp4]
    B -->|AAC Audio| D[Audio Stream .mp4]
    C --> E[Save to Disk]
    D --> E
    E --> F[Merge via VLC / FFmpeg]
    
    style A fill:#0077B5,color:white,stroke:#00d2ff
    style C fill:#004E7A,color:white,stroke:none
    style D fill:#004E7A,color:white,stroke:none
    style F fill:#00d2ff,color:black,stroke:none
```

> **Note:** Browser-based merging is unstable for large 4K files. Downloading streams separately guarantees you get the raw data directly from the CDN.

---

## 🛡️ Disclaimer

> This tool is engineered for **educational purposes** and personal archiving of content you legally access. The code interacts with Vimeo's player API and HLS manifests.

<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0077B5&height=100&section=footer"/>
</div>