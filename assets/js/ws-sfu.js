class SfuWebSocket extends SfuClient {
    constructor() {
        this.sock;
    }

    join(json) {
        this.json = json;
        this.action = "ws/connect";
        this.connect();
    }

    send(message, to) {
        if (this.sock != null && this.sock.readyState === this.sock.OPEN) {
            let byteHedder = this.i32ToUint8Array(to);
            switch (typeof (message)) {
                case "string":
                    let byteMessage = new TextEncoder().encode(message);
                    this.sock.send(new Uint8Array([...byteHedder, ...byteMessage]));
                    console.log("[ws-sfu] send string");
                    break;
                case "object":
                    byteMessage = message;
                    this.sock.send(new Uint8Array([...byteHedder, ...byteMessage]));
                    break;
            }
            console.log('Send Message: ' + message);
        }
    }

    close() {
        console.log('Closing websocket');
        if (this.sock != null) {
            this.sock.close();
            this.sock = null;
        }
    }

    async connect() {
        const jsonStr = JSON.stringify(this.json);
        const jsonBase64 = btoa(jsonStr);

        console.log("json:" + jsonStr);

        const sock = new WebSocket("ws://localhost:7777/" + this.action + "/" + jsonBase64 + "/");
        this.sock = sock;
        sock.binaryType = "arraybuffer";

        sock.addEventListener("open", e => {
            console.log("[ws-sfu] open: " + e);
        });

        sock.addEventListener("message", e => {
            console.log("[ws-sfu] message: " + new TextDecoder().decode(e.data));
        });

        sock.addEventListener("close", e => {
            console.log("[ws-sfu] close: " + e);
        });

        sock.addEventListener("error", e => {
            console.log("[ws-sfu] error: " + e);
        });
    }
}