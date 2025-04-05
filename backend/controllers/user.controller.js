import { User } from "../models/user.model.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/generateToken.js";
import { deleteMediaFromCloudinary, uploadMedia } from "../utils/cloudinary.js";
import { catchAsync } from "../middleware/error.middleware.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { transporter } from "../config/nodemailer.js";
import { PASSWORD_RESET_TEMPLATE } from "../config/emailTemplate.js";
/**
 * Create a new user account
 * @route POST /api/v1/users/signup
 */
export const createUserAccount = catchAsync(async (req, res) => {
  // TODO: Implement create user account functionality
  const { name, email, password, role = "student" } = req.body;
  if ([name, email, password].some((i) => i.trim() === "")) {
    throw new ApiError("All fields are required", 400);
  }
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ApiError("User already exists", 400);
  }
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    role,
  });
  await user.updateLastActive();
  generateToken(res, user, "Account Created Successfully");
});

/**
 * Authenticate user and get token
 * @route POST /api/v1/users/signin
 */
export const authenticateUser = catchAsync(async (req, res) => {
  // TODO: Implement user authentication functionality
  const { email, password } = req.body;
  if (!email && !password) {
    throw new ApiError("Email and Password is required", 400);
  }
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new ApiError("User Not Found", 404);
  }
  //compare password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError("Password is invalid", 400);
  }
  await user.updateLastActive();
  await user.genarteToken(res, user, "User Authenticated");
});

/**
 * Sign out user and clear cookie
 * @route POST /api/v1/users/signout
 */
export const signOutUser = catchAsync(async (_, res) => {
  // TODO: Implement sign out functionality
  res.cookie("token", "", { maxAge: 0 });
  res.staus(200).json({
    success: true,
    message: "Signed Out Successfully",
  });
});

/**
 * Get current user profile
 * @route GET /api/v1/users/profile
 */
export const getCurrentUserProfile = catchAsync(async (req, res) => {
  // TODO: Implement get current user profile functionality
  const user = await User.findById(req._id).populate({
    path: "enrolledCourses.course",
    select: "title description totalDuration price category thumbnail",
  });
  res.staus(200).json({
    success: true,
    data: {
      ...user.toJSON(),
      totalEnrolledCourses: user.totalEnrolledCourses,
    },
  });
});

/**
 * Update user profile
 * @route PATCH /api/v1/users/profile
 */
export const updateUserProfile = catchAsync(async (req, res) => {
  // TODO: Implement update user profile functionality
  const userid = req.user._id;
  const oldUser = await User.findById(userid);
  const oldAvatar = oldUser.avatar.split("/").pop().split(".")[0];
  const { name, email, bio } = req.body;
  const updateData = { name, email, bio };

  if (req.file) {
    const avatarResult = await uploadMedia(req.file.path);
    updateData.avatar = avatarResult.secure_url;
    const user = await User.findById(req.id);
    if (user.avatar && user.avatar !== "default-avatar.png") {
      await deleteMediaFromCloudinary(user.avatar);
    }
  }
  const updatedUser = await User.findByIdAndUpdate(userid, updateData);
  res.status(200).json({
    success: true,
    message: "User Updated Successfully",
    data: updateData,
  });
});

/**
 * Change user password
 * @route PATCH /api/v1/users/password
 */
export const changeUserPassword = catchAsync(async (req, res) => {
  // TODO: Implement change user password functionality
  const { newPassword, password } = req.body;
  const user = await User.findById(req.user._id);

  if (!password && !newPassword) {
    throw new ApiError("Password is required to change the pass", 402);
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError("Password is incorrect", 401);
  }
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });
  res
    .status(200)
    .json({ success: true, message: "Password updated successfully" });
});

/**
 * Request password reset
 * @route POST /api/v1/users/forgot-password
 */
export const forgotPassword = catchAsync(async (req, res) => {
  // TODO: Implement forgot password functionality
  const { email } = req.body;
  if (!email) {
    throw ApiError("Email is required to forgot password", 401);
  }
  const user = await User.findOne({ email });
  if (!user) {
    ApiError("User not found", 404);
  }
  const otp = user.getResetPasswordToken();
  const mailOptions = {
    from: `Learnify <${process.env.SENDER_EMAIL}>`,
    to: email,
    subject: "Reset your password",
    html: PASSWORD_RESET_TEMPLATE.replace("{{otp}}", otp).replace(
      "{{email}}",
      user.email
    ),
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.response);
    console.log("Message ID:", info.messageId);
    return res
      .status(200)
      .json({ success: true, data: user, message: "OTP sent to email" });
  } catch (error) {
    console.error("Detailed email error:", {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack,
    });
    throw new ApiError(400, `Error sending email: ${error.message}`);
  }
});

/**
 * Reset password
 * @route POST /api/v1/users/reset-password/:token
 */
export const resetPassword = catchAsync(async (req, res) => {
  // TODO: Implement reset password functionality
  const { otp, newPassword, email } = req.body;
  if (!email || !otp || !newPassword) {
    throw new ApiError("All fields are required", 401);
  }
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError("User not found", 401);
  }

  if (user.resetPasswordToken !== otp) {
    throw new ApiError("Invalid OTP", 401);
  }
  if (user.resetPasswordExpire < Date.now()) {
    throw new ApiError("OTP expired", 401);
  }
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save({ validateBeforeSave: false });
  res
    .status(200)
    .json({ success: true, message: "Password forgot successfully" });
});

/**
 * Delete user account
 * @route DELETE /api/v1/users/account
 */
export const deleteUserAccount = catchAsync(async (req, res) => {
  const user = await User.findById(req.id);

  // Delete avatar if not default
  if (user.avatar && user.avatar !== "default-avatar.png") {
    await deleteMediaFromCloudinary(user.avatar);
  }

  // Delete user
  await User.findByIdAndDelete(req.id);

  res.cookie("token", "", { maxAge: 0 });
  res.status(200).json({
    success: true,
    message: "Account deleted successfully",
  });
});
