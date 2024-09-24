//import { SfuPeerConnection } from "./webrtc-sfu.js";

var peerConnection = new SfuPeerConnection();

// https://stackoverflow.com/questions/13905435/javascript-getting-specific-element-of-parent-by-name
Element.prototype.getElementsByName = function (arg) {
    var returnList = [];
    (function BuildReturn(startPoint) {
        for (var child in startPoint) {
            if (startPoint[child].nodeType != 1) continue; //not an element
            if (startPoint[child].getAttribute("name") == arg) returnList.push(startPoint[child]);
            if (startPoint[child].childNodes.length > 0) {
                BuildReturn(startPoint[child].childNodes);
            }
        }
    })(this.childNodes);
    return returnList;
};

function getUrlQueries() {
    var queryStr = window.location.search.slice(1);
    queries = {};

    if (!queryStr) {
        return queries;
    }

    queryStr.split('&').forEach(function (queryStr) {
        var queryArr = queryStr.split('=');
        queries[queryArr[0]] = queryArr[1];
    });

    return queries;
}

function createClient() {
    const room_id = document.getElementById("room/join").getElementsByName("room_id")[0].getAttribute("value");
    window.open(document.URL + "?room_id=" + String(room_id), null);
}

async function post(action) {
    try {
        var response = await window.fetch(action, {
            method: "POST",
        });

        response = await response.text();

        console.log(response);

    } catch (e) {
        console.log(e);
    }
}

const forms = document.getElementsByTagName("form");

const form_pattern0 = ["room", "room/join", "room/exit", "room/create", "room/delete", "stream/whip", "stream/whep", "stream/reforward", "stream/infos", "send_message"];

window.addEventListener('DOMContentLoaded', () => {
    for (var i = 0; i < forms.length; i++) {
        if (form_pattern0.includes(forms[i].getAttribute("action"))) {
            forms[i].addEventListener("submit", async event => {
                event.preventDefault();

                const form = event.currentTarget;
                const action = form.getAttribute("action");

                const formData = new FormData(form);
                const json = {};
                formData.forEach((value, key) => {
                    elem = form.getElementsByName(key)[0];
                    switch (elem.getAttribute("type")) {
                        case "number":
                            json[key] = Number(value);
                            break;
                        case "radio":
                            json[key] = value == "true" ? true : false;
                            break;
                        default:
                            json[key] = value;
                            break;
                    }
                });

                switch (action) {
                    case "send_message":
                        peerConnection.sendData(json.sender_message);
                        break;
                    case "stream/whip":
                        peerConnection.whip(json);
                        break;
                    case "stream/whep":
                        peerConnection.whep(json);
                        break;
                    default:
                        const jsonStr = JSON.stringify(json);
                        const jsonBase64 = btoa(jsonStr);

                        console.log("jsonStr: " + jsonStr);
                        console.log("jsonBase64: " + jsonBase64);

                        try {
                            var response = window.fetch(action + "/" + jsonBase64 + "/", {
                                method: "POST",
                            });

                            response = await response
                                .then(r => {
                                    return r.clone().json()
                                        .then(r => {
                                            r.isJson = true;
                                            return r;
                                        })
                                        .catch(() => {
                                            r = r.text();
                                            r.isJson = false;
                                            return r;
                                        });
                                });

                            switch (action) {
                                case "room":
                                    break;
                                case "room/join":
                                    if (response.isJson) {
                                        document.getElementById("room/exit").getElementsByName("user_id")[0].setAttribute("value", response.user_id);
                                        document.getElementById("room/exit").getElementsByName("user_token")[0].setAttribute("value", response.user_token);

                                        document.getElementById("stream/whip").getElementsByName("user_id")[0].setAttribute("value", response.user_id);
                                        document.getElementById("stream/whip").getElementsByName("user_token")[0].setAttribute("value", response.user_token);

                                        document.getElementById("stream/whep").getElementsByName("user_id")[0].setAttribute("value", response.user_id);
                                        document.getElementById("stream/whep").getElementsByName("user_token")[0].setAttribute("value", response.user_token);
                                    }
                                    break;
                                case "room/exit":
                                    break;
                                case "room/create":
                                    if (response.isJson) {
                                        document.getElementById("room").getElementsByName("room_id")[0].setAttribute("value", response.room_id);
                                        document.getElementById("room/join").getElementsByName("room_id")[0].setAttribute("value", response.room_id);
                                        document.getElementById("room/exit").getElementsByName("room_id")[0].setAttribute("value", response.room_id);
                                        document.getElementById("room/delete").getElementsByName("room_id")[0].setAttribute("value", response.room_id);

                                        document.getElementById("stream/whip").getElementsByName("room_id")[0].setAttribute("value", response.room_id);
                                        document.getElementById("stream/whep").getElementsByName("room_id")[0].setAttribute("value", response.room_id);
                                    }
                                    break;
                                case "room/delete":
                                    break;
                            }

                            console.log((response.isJson ? "json:" : "text:") + JSON.stringify(response));

                        } catch (e) {
                            console.log(e);
                        }
                        break;
                }
            });
        }
    };

    const leftVideo = document.getElementById('leftVideo');
    const rightVideo = document.getElementById('rightVideo');

    leftVideo.addEventListener('canplay', () => {
        let stream;
        const fps = 0;
        if (leftVideo.captureStream) {
            stream = leftVideo.captureStream(fps);
        } else if (leftVideo.mozCaptureStream) {
            stream = leftVideo.mozCaptureStream(fps);
        } else {
            console.error('Stream capture is not supported');
            stream = null;
        }
        rightVideo.srcObject = stream;
    });

    var queries = getUrlQueries();
    if (queries["room_id"]) {
        var room_id = Number(queries["room_id"]);

        document.getElementById("room").getElementsByName("room_id")[0].setAttribute("value", room_id);
        document.getElementById("room/join").getElementsByName("room_id")[0].setAttribute("value", room_id);
        document.getElementById("room/exit").getElementsByName("room_id")[0].setAttribute("value", room_id);
        document.getElementById("room/delete").getElementsByName("room_id")[0].setAttribute("value", room_id);

        document.getElementById("stream/whip").getElementsByName("room_id")[0].setAttribute("value", room_id);
        document.getElementById("stream/whep").getElementsByName("room_id")[0].setAttribute("value", room_id);
    }
});