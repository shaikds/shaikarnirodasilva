import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { authRateLimiter } from "../middleware/rateLimiter.middleware";
import { registerUserSchema, loginUserSchema, changePasswordSchema } from "@trendsupply/shared";

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  validate(registerUserSchema),
  AuthController.register
);

router.post(
  "/login",
  authRateLimiter,
  validate(loginUserSchema),
  AuthController.login
);

router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  AuthController.changePassword
);

router.get("/me", authenticate, AuthController.me);

export default router;
