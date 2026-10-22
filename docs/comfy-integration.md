# Comfy Desktop in OwlSift

## Connect and generate

1. Start Comfy Desktop, complete its local installation, and wait for the ComfyUI editor. Copy the running instance's actual server URL/port from its server settings or logs.
2. Install an image model and run a text-to-image workflow successfully inside Comfy Desktop first.
3. In OwlSift, open **Settings → Comfy Desktop**, enable the integration, enter the server base URL (without /v1), and verify the connection. Verification reads server information, nodes, and checkpoints; it does not submit a generation.
4. For the built-in workflow, select a full SD 1.x or SDXL checkpoint containing CLIP and VAE. Other architectures, including FLUX and SD3, need their own exported workflow.
5. Alternatively, export your working graph with **File → Export (API)** and import its JSON. Map the positive prompt's node ID and literal string input. Negative prompt and numeric seed mappings are optional. Include a SaveImage node. Model, resolution, and sampler settings remain those in your custom graph.
6. Open **AI Assistant → Image generation**. Choose the destination workspace, enter a prompt, and select Standard, Illustration, Product photo, or App icon. Optionally refine the prompt using the selected text model, review it, then generate.
7. OwlSift copies up to eight output images (maximum 30 MB each) into the chosen workspace without overwriting existing files. Images appear as previews and file links in the originating chat. Comfy retains its original output.

Text and image providers are independent: a local LM Studio text model can refine prompts while Comfy runs a local image model. GPU memory must accommodate both, or one model must be unloaded. A global text provider sends prompt refinement to that provider even if the image workflow is local.

In the browser, project files are stored as OwlSift project copies in browser storage; file links download their bytes. Electron writes directly into the workspace folder. Use persistent browser storage and export important files.

## Docker, WSL, and browser access

The default **OwlSift server proxy** makes requests from the Nuxt server; Electron uses its main-process bridge. If Comfy runs in Windows and OwlSift runs inside Docker/WSL, 127.0.0.1 refers to the container or WSL environment. Use a reachable Windows address, or host.docker.internal with Docker Desktop, and configure Comfy's listening address and Windows firewall for the private network.

The optional **Direct** browser mode needs browser access to Comfy and appropriate CORS permission. An HTTPS OwlSift page may block an HTTP Comfy endpoint as mixed content. A static web deployment without a Nuxt API server must use Direct mode. Use the server URL and port actually reported by Comfy Desktop.

Server bearer tokens are for an authenticated server/reverse proxy. They are separate from the optional Comfy Partner Nodes API key and from the text model's API key. Connection settings and keys follow OwlSift's existing local settings persistence.

## Local and cloud workflows

Local-only mode is enabled by default. OwlSift inspects the server's node catalog: API/Partner Nodes are marked cloud, recognized core nodes are local, and unknown custom nodes are unverified. Missing nodes prevent submission. Cloud or unverified graphs require disabling local-only mode and acknowledging the warning before submission. This metadata check is not a network sandbox or an audit of custom Python code: review third-party nodes yourself.

The Comfy cloud key is sent only when detected cloud nodes need it. Other custom providers may require credentials configured in Comfy. Verification alone cannot prove a workflow's models and node parameters are valid; Comfy validates the submitted graph.

## Progress and stopping

OwlSift polls the job history and queue, and uses prompt-specific WebSocket progress when available. Stop waiting removes only this job if it is still queued. A running workflow may finish in Comfy; OwlSift does not issue a server-wide interrupt. Reloading OwlSift loses the pending UI session; inspect the original job in Comfy before submitting again. Transport errors do not automatically resubmit jobs.

## Media generation and RAG

Generated files are indexed by their normal file metadata. Their visual content is not automatically searchable, and the generation prompt is not substituted for extracted content. Image descriptions/OCR, audio transcripts, and video frame descriptions require a separate media extraction/indexing feature.

The integration separates server transport, workflow preparation/risk assessment, media output adapters, and project saving. Media kinds and output adapters reserve extension points for audio/video; this release executes and saves image outputs only. Future formats need their own validation, preview, saving, and RAG extraction adapters.

## Official documentation

- [Comfy Desktop for Windows](https://docs.comfy.org/installation/desktop/windows)
- [Text-to-image workflow](https://docs.comfy.org/tutorials/basic/text-to-image)
- [API workflow example and export format](https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/basic_api_example.py)
- [Server routes](https://docs.comfy.org/development/comfyui-server/comms_routes)
- [WebSocket messages](https://docs.comfy.org/development/comfyui-server/comms_messages)
- [Partner/cloud nodes](https://docs.comfy.org/tutorials/partner-nodes/overview)

## Connection-status widget

Opening Settings → Comfy Desktop or expanding image generation triggers GET / at the configured server address (default http://localhost:8188/). Retry connection repeats the check. Address/token/transport changes recheck after a short delay. Checks bypass HTTP caches.

- **Connected and ready:** the root serves an HTML editor page and the Comfy system/node APIs are available.
- **Connected, but workspace not connected:** the root responds, but the editor page or Comfy workflow APIs are unavailable (including HTTP authentication or startup errors).
- **Disconnected:** the root cannot be reached through the selected transport. Browser CORS and mixed-content restrictions may also prevent access.

Comfy does not expose the currently open Desktop editor graph through GET /. This widget checks editor/API availability, not whether a particular graph tab is open, model weights are loaded, or generation parameters will pass validation. Local-only and workflow configuration checks remain separate.
