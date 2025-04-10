import { Course } from "../models/course.model.js";
import { Lecture } from "../models/lecture.model.js";
import { User } from "../models/user.model.js";
import { deleteMediaFromCloudinary, uploadMedia } from "../utils/cloudinary.js";
import { catchAsync } from "../middleware/error.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { ApiError } from "../middlewares/error.middleware.js";

/**
 * Create a new course
 * @route POST /api/v1/courses
 */
export const createNewCourse = catchAsync(async (req, res) => {
  // TODO: Implement create new course functionality

  const { title, description, category, price, level, duration } = req.body;
  if (!title && !price && !category) {
    throw new ApiError(
      "Title, price and category are required to create cousre",
      401
    );
  }
  const user = await User.findById(req.id);
  if (!user) {
    throw new ApiError("User not found", 404);
  }

  let thumbnail;

  if (req.file) {
    const thumbnailLocalPath = req.file.path;
    thumbnail = await uploadMedia(thumbnailLocalPath);
    if (!thumbnail) {
      throw new ApiError("Failed to upload thumbnail", 401);
    }
  }
  const course = await Course.create({
    title,
    description,
    category,
    price,
    level,
    thumbnail: thumbnail.url,
    instructor: req.id,
    totalDuration: duration,
  });

  // Add course to instructor's created courses
  await User.findByIdAndUpdate(req.id, {
    $push: { createdCourses: course._id },
  });

  res.status(200).json({
    success: true,
    data: course,
    message: "Course Created Successfully",
  });
});

/**
 * Search courses with filters
 * @route GET /api/v1/courses/search
 */
export const searchCourses = catchAsync(async (req, res) => {
  // TODO: Implement search courses functionality
  const {
    query = "",
    categories = [],
    level,
    priceRange,
    sortBy = "newest",
  } = req.query;
  // Create search query
  const searchCriteria = {
    isPublished: true,
    $or: [
      { title: { $regex: query, $options: "i" } },
      { subtitle: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
    ],
  };

  // Apply filters
  if (categories.length > 0) {
    searchCriteria.category = { $in: categories };
  }
  if (level) {
    searchCriteria.level = level;
  }
  if (priceRange) {
    const [min, max] = priceRange.split("-");
    searchCriteria.price = { $gte: min || 0, $lte: max || Infinity };
  }

  // Define sorting
  const sortOptions = {};
  switch (sortBy) {
    case "price-low":
      sortOptions.price = 1;
      break;
    case "price-high":
      sortOptions.price = -1;
      break;
    case "oldest":
      sortOptions.createdAt = 1;
      break;
    default:
      sortOptions.createdAt = -1;
  }
  const courses = await Course.find(searchCriteria)
    .populate({
      path: "instructor",
      select: "name avatar",
    })
    .sort(sortOptions);

  res.status(200).json({
    success: true,
    count: courses.length,
    data: courses,
  });
});

/**
 * Get all published courses
 * @route GET /api/v1/courses/published
 */
export const getPublishedCourses = catchAsync(async (req, res) => {
  // TODO: Implement get published courses functionality
});

/**
 * Get courses created by the current user
 * @route GET /api/v1/courses/my-courses
 */
export const getMyCreatedCourses = catchAsync(async (req, res) => {
  // TODO: Implement get my created courses functionality
});

/**
 * Update course details
 * @route PATCH /api/v1/courses/:courseId
 */
export const updateCourseDetails = catchAsync(async (req, res) => {
  // TODO: Implement update course details functionality
  const { courseId } = req.params;
  const { title, subtitle, description, category, level, price } = req.body;

  const course = await Course.findById(courseId);
  if (!course) {
    throw new AppError("Course not found", 404);
  }

  // Verify ownership
  if (course.instructor.toString() !== req.id) {
    throw new AppError("Not authorized to update this course", 403);
  }

  // Handle thumbnail upload
  let thumbnail;
  if (req.file) {
    if (course.thumbnail) {
      await deleteMediaFromCloudinary(course.thumbnail);
    }
    const result = await uploadMedia(req.file.path);
    thumbnail = result?.secure_url || req.file.path;
  }

  const updatedCourse = await Course.findByIdAndUpdate(
    courseId,
    {
      title,
      subtitle,
      description,
      category,
      level,
      price,
      ...(thumbnail && { thumbnail }),
    },
    { new: true, runValidators: true }
  );

  res.status(200).json({
    success: true,
    message: "Course updated successfully",
    data: updatedCourse,
  });
});

/**
 * Get course by ID
 * @route GET /api/v1/courses/:courseId
 */
export const getCourseDetails = catchAsync(async (req, res) => {
  // TODO: Implement get course details functionality
  const course = await Course.findById(req.params.courseId)
    .populate({
      path: "instructor",
      select: "name avatar bio",
    })
    .populate({
      path: "lectures",
      select: "title videoUrl duration isPreview order",
    });

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  res.status(200).json({
    success: true,
    data: {
      ...course.toJSON(),
    },
  });
});

/**
 * Add lecture to course
 * @route POST /api/v1/courses/:courseId/lectures
 */
export const addLectureToCourse = catchAsync(async (req, res) => {
  // TODO: Implement add lecture to course functionality
  const { title, description, isPreview } = req.body;
  const { courseId } = req.params;

  // Get course and verify ownership
  const course = await Course.findById(courseId);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.instructor.toString() !== req.id) {
    throw new AppError("Not authorized to add lecture in to this course", 403);
  }

  // Handle video upload
  if (!req.file) {
    throw new AppError("Video file is required", 400);
  }

  // Upload video to cloudinary
  const result = await uploadMedia(req.file.path);
  if (!result) {
    throw new AppError("Error uploading video", 500);
  }

  // Create lecture with video details from cloudinary
  const lecture = await Lecture.create({
    title,
    description,
    isPreview,
    order: course.lectures.length + 1,
    videoUrl: result?.secure_url || req.file.path,
    publicId: result?.public_id || req.file.path,
    duration: result?.duration || 0, // Cloudinary provides duration for video files
  });

  // Add lecture to course
  course.lectures.push(lecture._id);
  await course.save();

  res.status(201).json({
    success: true,
    message: "Lecture added successfully",
    data: lecture,
  });
});

/**
 * Get course lectures
 * @route GET /api/v1/courses/:courseId/lectures
 */
export const getCourseLectures = catchAsync(async (req, res) => {
  // TODO: Implement get course lectures functionality
  const { courseId } = req.params;
  if (!courseId) {
    throw new ApiError("Course id is required to get lectures");
  }
  const course = await Course.findById(req.params.courseId).populate({
    path: "lectures",
    select: "title description videoUrl duration isPreview order",
    options: { sort: { order: 1 } },
  });
  if (!course) {
    throw new AppError("Course not found", 404);
  }

  // Check if user has access to full course content
  const isEnrolled = course.enrolledStudents.includes(req.id);
  const isInstructor = course.instructor.toString() === req.id;

  let lectures = course.lectures;
  if (!isEnrolled) {
    // Only return preview lectures for non-enrolled users
    lectures = lectures.filter((lecture) => lecture.isPreview);
  }

  res.status(200).json({
    success: true,
    data: {
      lectures,
      isEnrolled,
      isInstructor,
    },
  });
});
