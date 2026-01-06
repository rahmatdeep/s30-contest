import express from "express";
import cors from "cors";
import { authRouter } from "./Routes/auth";
import { conversationRouter } from "./Routes/conversation";
const app = express()

app.use(cors());
app.use(express.json());

app.use("/auth", authRouter);
app.use("/conversations", conversationRouter)
