import { Request, Response } from "express";
import { authService } from "./auth.service";

export const authController = {
  async signup(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    try {
      const result = await authService.signup(email, password);
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  },

  async login(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    try {
      const result = await authService.login(email, password);
      return res.json(result);
    } catch (err: any) {
      return res.status(401).json({ message: err.message });
    }
  },
};