import { Server as WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { Conversation, Message } from "./db";
import { inMemoryMessages } from "./Routes/conversation";

interface ExtendedWebSocket extends WebSocket {
  user?: {
    userId: string;
    role: "admin" | "supervisor" | "agent" | "candidate";
  };
  rooms: Set<string>;
}

const rooms: Record<string, Set<ExtendedWebSocket>> = {};

export function setupWebSocket(server: any) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws: ExtendedWebSocket, req) => {
    const query = req.url ? req.url.split("?")[1] || "" : "";
    const params = new URLSearchParams(query);
    const token = params.get("token");
    if (!token) {
      ws.send(
        JSON.stringify({
          event: "ERROR",
          data: { message: "Unauthorized or invalid token" },
        })
      );
      ws.close();
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
      if (!decoded.userId || !decoded.role) throw new Error();
    } catch {
      ws.send(
        JSON.stringify({
          event: "ERROR",
          data: { message: "Unauthorized or invalid token" },
        })
      );
      ws.close();
      return;
    }

    ws.user = { userId: decoded.userId, role: decoded.role };
    ws.rooms = new Set();

    ws.on("message", async (msg: string) => {
      let parsed;
      try {
        parsed = JSON.parse(msg);
      } catch {
        ws.send(
          JSON.stringify({
            event: "ERROR",
            data: { message: "Invalid message format" },
          })
        );
        return;
      }
      const { event, data } = parsed || {};

      // JOIN_CONVERSATION
      if (event === "JOIN_CONVERSATION") {
        const { conversationId } = data || {};
        if (!conversationId) {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Invalid request schema" },
            })
          );
          return;
        }
        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Not allowed to access this conversation" },
            })
          );
          return;
        }

        
        if (conv.status === "closed") {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Conversation already closed" },
            })
          );
          return;
        }

        if (ws.user!.role === "candidate") {
          if (conv.candidateId.toString() !== ws.user!.userId) {
            ws.send(
              JSON.stringify({
                event: "ERROR",
                data: { message: "Not allowed to access this conversation" },
              })
            );
            return;
          }
        } else if (ws.user!.role === "agent") {
          if (!conv.agentId || conv.agentId.toString() !== ws.user!.userId) {
            ws.send(
              JSON.stringify({
                event: "ERROR",
                data: { message: "Not allowed to access this conversation" },
              })
            );
            return;
          }
          
          if (conv.status === "open") {
            conv.status = "assigned";
            await conv.save();
          }
        } else {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Forbidden for this role" },
            })
          );
          return;
        }

        const room = `conversation:${conversationId}`;
        if (!rooms[room]) rooms[room] = new Set();
        rooms[room].add(ws);
        ws.rooms.add(room);
        if (!inMemoryMessages.has(conversationId))
          inMemoryMessages.set(conversationId, []);
        ws.send(
          JSON.stringify({
            event: "JOINED_CONVERSATION",
            data: { conversationId, status: conv.status },
          })
        );
      }

      // SEND_MESSAGE
      else if (event === "SEND_MESSAGE") {
        if (ws.user!.role !== "candidate" && ws.user!.role !== "agent") {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Forbidden for this role" },
            })
          );
          return;
        }

        const { conversationId, content } = data || {};

        if (!conversationId || !content || typeof content !== "string") {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Invalid request schema" },
            })
          );
          return;
        }

        const room = `conversation:${conversationId}`;
        if (!ws.rooms.has(room)) {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "You must join the conversation first" },
            })
          );
          return;
        }

        const message = {
          senderId: ws.user!.userId,
          senderRole: ws.user!.role,
          content,
          createdAt: new Date(),
        };
        inMemoryMessages.get(conversationId)!.push(message);

        for (const client of rooms[room]) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                event: "NEW_MESSAGE",
                data: { conversationId, ...message },
              })
            );
          }
        }
      }

      // LEAVE_CONVERSATION
      else if (event === "LEAVE_CONVERSATION") {
        if (ws.user!.role !== "candidate" && ws.user!.role !== "agent") {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Forbidden for this role" },
            })
          );
          return;
        }

        const { conversationId } = data || {};

        if (!conversationId) {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Invalid request schema" },
            })
          );
          return;
        }

        const room = `conversation:${conversationId}`;
        ws.rooms.delete(room);
        if (rooms[room]) {
          rooms[room].delete(ws);
          if (rooms[room].size === 0) delete rooms[room];
        }
        ws.send(
          JSON.stringify({
            event: "LEFT_CONVERSATION",
            data: { conversationId },
          })
        );
      }

      // CLOSE_CONVERSATION
      else if (event === "CLOSE_CONVERSATION") {
        if (ws.user!.role !== "agent") {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Forbidden for this role" },
            })
          );
          return;
        }

        const { conversationId } = data || {};

        if (!conversationId) {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Invalid request schema" },
            })
          );
          return;
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Not allowed to access this conversation" },
            })
          );
          return;
        }
        if (!conv.agentId || conv.agentId.toString() !== ws.user!.userId) {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Not allowed to access this conversation" },
            })
          );
          return;
        }
        if (conv.status === "open") {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Conversation not yet assigned" },
            })
          );
          return;
        }
        if (conv.status === "closed") {
          ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Conversation already closed" },
            })
          );
          return;
        }

        const msgs = inMemoryMessages.get(conversationId) || [];
        if (msgs.length) {
          await Message.insertMany(
            msgs.map((m) => ({
              conversationId,
              senderId: m.senderId,
              senderRole: m.senderRole,
              content: m.content,
              createdAt: m.createdAt,
            }))
          );
        }
        conv.status = "closed";
        await conv.save();

        const room = `conversation:${conversationId}`;
        if (rooms[room]) {
          for (const client of rooms[room]) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  event: "CONVERSATION_CLOSED",
                  data: { conversationId },
                })
              );
            }
            client.rooms.delete(room);
          }
          delete rooms[room];
        }
        inMemoryMessages.delete(conversationId);
      } else {
        ws.send(
          JSON.stringify({ event: "ERROR", data: { message: "Unknown event" } })
        );
      }
    });

    ws.on("close", () => {
      for (const room of ws.rooms) {
        if (rooms[room]) {
          rooms[room].delete(ws);
          if (rooms[room].size === 0) delete rooms[room];
        }
      }
      ws.rooms.clear();
    });
  });
}