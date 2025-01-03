use std::usize;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::Path;
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

use crate::result::Result;
use crate::room::Room;
use crate::route::*;
use crate::ROOMS;

pub fn route() -> Router<AppState> {
    Router::new().route("/ws/connect/:base64/", get(stream))
}

#[derive(Serialize, Deserialize)]
struct RequestJson {
    room_id: i32,
    user_id: i32,
    token: u32,
    stream: String,
    shared_key: String,
}

async fn stream(
    Path(params): Path<HashMap<String, String>>,
    ws: WebSocketUpgrade,
) -> Result<Response> {
    debug!("HTTP GET /ws/connect");

    let request: RequestJson = match parse_base64_into_json(&params) {
        Ok(request) => request,
        Err(err_response) => return Ok(err_response),
    };

    let (_room, _client) = match auth_user(
        request.room_id.clone(),
        request.shared_key.clone(),
        request.user_id,
        request.token,
    )
    .await
    {
        Ok((room, client)) => (room, client),
        Err(err_response) => return Ok(err_response),
    };

    return Ok(ws.on_upgrade(|socket: WebSocket| {
        let request = request;
        Box::pin(async move {
            let stream = request.stream;
            let id = request.user_id as u32;

            let mut rooms = ROOMS.lock().await;
            if !rooms.contains_key(&request.room_id) {
                error!("[ws] room does not exist");
            }

            let room: &mut Room = rooms.get_mut(&request.room_id).unwrap();

            let (mut socekt_sender, mut socket_receiver) = socket.split();
            let group_manager = room.group_manager();
            let group_manager = group_manager.write().await;

            drop(rooms);

            group_manager.init_user(id).await;

            let group_sender = group_manager
                .join_or_create(id, stream.clone())
                .await
                .unwrap();

            let user_receiver = group_manager.get_user_receiver(stream.clone(), id).await;
            let mut user_receiver = match user_receiver {
                Ok(user_receiver) => user_receiver,
                Err(error) => {
                    socekt_sender
                        .send(Message::Text(error.to_string()))
                        .await
                        .unwrap();
                    socekt_sender.close().await.unwrap();
                    return;
                }
            };

            let user_sender_map = group_manager.get_user_sender_map(stream.clone()).await;
            let user_sender_map = match user_sender_map {
                Ok(user_sender_map) => user_sender_map,
                Err(error) => {
                    socekt_sender
                        .send(Message::Text(error.to_string()))
                        .await
                        .unwrap();
                    socekt_sender.close().await.unwrap();
                    return;
                }
            };
            drop(group_manager);

            debug!("[ws] start receive/send loop ...");

            let mut send_task = tokio::spawn(async move {
                while let Ok(message) = user_receiver.recv().await {
                    if let Err(_err) = socekt_sender.send(Message::Binary(message.to_vec())).await {
                        // Maybe stream has been closed
                        return;
                    }
                    //debug!("[ws] forwarding message ...");
                }
            });

            let mut recv_task = tokio::spawn(async move {
                let id = id;
                let mut header = vec![0u8; 5]; // typ (1) + from (0 ~ 3) + to (4 ~ 7)
                for i in 0..4 {
                    header[i + 1] = (id >> (i * 8)) as u8;
                }

                header[0] = 1; // open
                let mut dummy_buf = vec![0u8; 4];
                for i in 0..4 {
                    dummy_buf[i] = (id >> (i * 8)) as u8;
                }
                if let Err(err) = group_sender.send([header.clone(), dummy_buf.clone()].concat()) {
                    info!("[ws] send socket err: {}", err);
                    return;
                }

                header[0] = 0; // struct

                while let Some(Ok(message)) = socket_receiver.next().await {
                    match message {
                        // Unity's NativeWebSocket handles both text and binary as a
                        // byte array in the message receive callback. So this
                        // server only uses binary for WebSocket.
                        Message::Binary(binary) => {
                            //debug!("[ws] received binary message: {:?}", &binary);
                            let is_broadcast = header[1..5] == binary[..4];
                            if is_broadcast {
                                //debug!("[ws] send broadcast message");
                                if let Err(err) = 
                                group_sender.send([header.clone(), binary].concat())
                                {
                                    info!("[ws] send socket err: {}", err);
                                    return;
                                }
                            } else {
                                //debug!("[ws] send unicast message");
                                let to = u32::from_be_bytes([
                                    binary[3], binary[2], binary[1], binary[0],
                                ]);
                                let user_sender_map = user_sender_map.read().unwrap();
                                if let Some(user_sender) = user_sender_map.get(&to) {
                                    if let Err(err) =
                                        user_sender.send([header.clone(), binary].concat())
                                    {
                                        info!("[ws] send socket err: {}", err);
                                        return;
                                    }
                                }
                                drop(user_sender_map);
                            }
                        }
                        Message::Text(text) => {
                            warn!(
                                "[ws] received text message. this message will not be processed.: {}",
                                text
                            );
                        }
                        Message::Ping(_vec) => {}
                        Message::Pong(_vec) => {}
                        Message::Close(_close_frame) => {
                        }
                    }
                }
            });

            tokio::select! {
                _ = (&mut send_task) => recv_task.abort(),
                _ = (&mut recv_task) => send_task.abort(),
            };

            let mut rooms = ROOMS.lock().await;
            let room: &mut Room = rooms.get_mut(&request.room_id).unwrap();
            let group_manager = room.group_manager();
            let group_manager = group_manager.write().await;
            let _ = group_manager.leave_group(stream.clone(), id).await;
            drop(group_manager);

            info!("[ws] connection closed");
        })
    }));
}
