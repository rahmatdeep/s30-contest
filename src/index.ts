import express from "express";
import http from "http";
import cors from "cors";
import { authRouter } from "./Routes/auth";
import { conversationRouter } from "./Routes/conversation";
import { adminRouter } from "./Routes/admin";
import { setupWebSocket } from "./ws";
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
setupWebSocket(server);

app.use("/auth", authRouter);
app.use("/conversations", conversationRouter);
app.use("/admin", adminRouter);

server.listen(3000, () => console.log("server listening on port 3000"));
