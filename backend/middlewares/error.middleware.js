export const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch((err) => next(err));
  };
};

// Custom error class
export class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handling middleware
export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") {
    // Development error response
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  } else {
    // Production error response
    if (err.isOperational) {
      // Operational, trusted error: send message to client
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    } else {
      // Programming or other unknown error: don't leak error details
      console.error("ERROR 💥", err);
      res.status(500).json({
        status: "error",
        message: "Something went wrong!",
      });
    }
  }
};

// Handle specific MongoDB errors
export const handleMongoError = (err) => {
  if (err.name === "CastError") {
    return new ApiError(`Invalid ${err.path}: ${err.value}`, 400);
  }
  if (err.code === 11000) {
    const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
    return new ApiError(
      `Duplicate field value: ${value}. Please use another value!`,
      400
    );
  }
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((el) => el.message);
    return new ApiError(`Invalid input data. ${errors.join(". ")}`, 400);
  }
  return err;
};

// Handle JWT errors
export const handleJWTError = () =>
  new ApiError("Invalid token. Please log in again!", 401);

export const handleJWTExpiredError = () =>
  new ApiError("Your token has expired! Please log in again.", 401);
