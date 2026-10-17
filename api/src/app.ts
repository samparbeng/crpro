import express, { Router } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { requireAuth } from "./lib/auth.js";
import { errorHandler, HttpError, requireJson } from "./lib/http.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import {
  driversRouter,
  ratesRouter,
  vehicleCategoriesRouter,
  vehiclesRouter,
  vendorCategoriesRouter,
  vendorsRouter,
} from "./routes/catalog.js";
import { reservationsRouter } from "./routes/reservations.js";
import { exchangeRatesRouter, invoicesRouter, purchaseOrdersRouter, serviceRecordsRouter } from "./routes/documents.js";
import { dashboardRouter, reportsRouter } from "./routes/insights.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(requireJson);

  const api = Router();
  api.get("/health", (_req, res) => res.json({ ok: true }));
  api.use("/auth", authRouter);

  api.use(requireAuth);
  api.use("/dashboard", dashboardRouter);
  api.use("/reports", reportsRouter);
  api.use("/users", usersRouter);
  api.use("/vehicle-categories", vehicleCategoriesRouter);
  api.use("/vendor-categories", vendorCategoriesRouter);
  api.use("/rates", ratesRouter);
  api.use("/vendors", vendorsRouter);
  api.use("/drivers", driversRouter);
  api.use("/vehicles", vehiclesRouter);
  api.use("/reservations", reservationsRouter);
  api.use("/purchase-orders", purchaseOrdersRouter);
  api.use("/invoices", invoicesRouter);
  api.use("/service-records", serviceRecordsRouter);
  api.use("/exchange-rates", exchangeRatesRouter);
  api.use((_req, _res, next) => next(new HttpError(404, "Not found")));

  app.use("/api", api);
  app.use(errorHandler);
  return app;
}
