import { CourseProgress } from "../models/courseProgress.js";
import { Course } from "../models/course.model.js";
import { catchAsync } from "../middleware/error.middleware.js";
import { ApiError } from "../middlewares/error.middleware.js";
/**
 * Get user's progress for a specific course
 * @route GET /api/v1/progress/:courseId
 */
export const getUserCourseProgress = catchAsync(async (req, res) => {
  // TODO: Implement get user's course progress functionality
  const { courseId } = req.params;
  const course = await Course.findById(courseId).populate({
    path: "lectures",
    select: "videoUrl title duration description",
  });
  if (!course) {
    throw new ApiError("Course not found", 404);
  }
  // Get user's progress for the course
  const courseProgress = await CourseProgress.findOne({
    course: courseId,
    user: req.id,
  }).populate("course");

  // If no progress found, return course details with empty progress
  if (!courseProgress) {
    return res.status(200).json({
      success: true,
      data: {
        courseDetails,
        progress: [],
        isCompleted: false,
        completionPercentage: 0,
      },
    });
  }

  const totalLectures = course.lectures.length;
  const completedLectures = courseProgress.lectureProgress.filter(
    (lp) => lp.isCompleted
  ).length;
  const completionPercentage = Math.round(
    (completedLectures / totalLectures) * 100
  );
  res.status(200).json({
    success: true,
    data: {
      courseDetails,
      progress: courseProgress.lectureProgress,
      isCompleted: courseProgress.completed,
      completionPercentage,
    },
  });
});

/**
 * Update progress for a specific lecture
 * @route PATCH /api/v1/progress/:courseId/lectures/:lectureId
 */
export const updateLectureProgress = catchAsync(async (req, res) => {
  const { courseId, lectureId } = req.params;

  // Find or create course progress
  let courseProgress = await CourseProgress.findOne({
    course: courseId,
    user: req.user.id, // ✅ Ensure correct user reference
  });

  if (!courseProgress) {
    courseProgress = await CourseProgress.create({
      user: req.user.id,
      course: courseId,
      isCompleted: false,
      lectureProgress: [],
    });
  }

  // Check if lecture progress exists
  const lectureIndex = courseProgress.lectureProgress.findIndex(
    (lecture) => lecture.lecture.toString() === lectureId // ✅ Ensure correct ID comparison
  );

  if (lectureIndex !== -1) {
    courseProgress.lectureProgress[lectureIndex].isCompleted = true;
  } else {
    courseProgress.lectureProgress.push({
      lecture: lectureId,
      isCompleted: true,
    });
  }

  // Fetch course details
  const course = await Course.findById(courseId).populate("lectures");

  // Calculate completion percentage
  const totalLectures = course.lectures.length;
  let completedLectures = courseProgress.lectureProgress.filter(
    (lp) => lp.isCompleted
  ).length;

  courseProgress.completionPercentage = totalLectures > 0
    ? Math.round((completedLectures / totalLectures) * 100)
    : 0;

  // Check if the course is fully completed
  courseProgress.isCompleted = totalLectures > 0 && completedLectures === totalLectures;

  // Save the updated progress
  await courseProgress.save();

  res.status(200).json({
    success: true,
    message: "Lecture progress updated successfully",
    data: {
      lectureProgress: courseProgress.lectureProgress,
      isCompleted: courseProgress.isCompleted,
      completionPercentage: courseProgress.completionPercentage,
    },
  });
});

/**
 * Mark entire course as completed
 * @route PATCH /api/v1/progress/:courseId/complete
 */
export const markCourseAsCompleted = catchAsync(async (req, res) => {
  const { courseId } = req.params;

  // Find course progress
  const courseProgress = await CourseProgress.findOne({
    course: courseId,
    user: req.id,
  });

  if (!courseProgress) {
    throw new AppError("Course progress not found", 404);
  }

  // Mark all lectures as isCompleted
  courseProgress.lectureProgress.forEach((progress) => {
    progress.isCompleted = true;
  });
  courseProgress.isCompleted = true;

  await courseProgress.save();

  res.status(200).json({
    success: true,
    message: "Course marked as completed",
    data: courseProgress,
  });
});

/**
 * Reset course progress
 * @route PATCH /api/v1/progress/:courseId/reset
 */
export const resetCourseProgress = catchAsync(async (req, res) => {
  const { courseId } = req.params;

  // Find course progress
  const courseProgress = await CourseProgress.findOne({
    course: courseId,
    user: req.id,
  });

  if (!courseProgress) {
    throw new AppError("Course progress not found", 404);
  }

  // Reset all progress
  courseProgress.lectureProgress.forEach((progress) => {
    progress.isCompleted = false;
  });
  courseProgress.isCompleted = false;

  await courseProgress.save();

  res.status(200).json({
    success: true,
    message: "Course progress reset successfully",
    data: courseProgress,
  });
});
