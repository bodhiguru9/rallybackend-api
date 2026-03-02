const Sport = require('../../models/Sport');

/**
 * @desc    Create a new sport
 * @route   POST /api/sports
 * @access  Private (Admin/Organiser only)
 */
const createSport = async (req, res, next) => {
  try {
    const { name, description, icon, isActive } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Sport name is required',
      });
    }

    // Create sport
    const sport = await Sport.create({
      name,
      description: description || null,
      icon: icon || null,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      success: true,
      message: 'Sport created successfully',
      data: {
        sport: {
          sportId: sport.sportId,
          name: sport.name,
          description: sport.description,
          icon: sport.icon,
          isActive: sport.isActive,
          createdAt: sport.createdAt,
          updatedAt: sport.updatedAt,
        },
      },
    });
  } catch (error) {
    if (error.message === 'Sport with this name already exists') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Get all sports
 * @route   GET /api/sports?isActive=true
 * @access  Public
 */
const getAllSports = async (req, res, next) => {
  try {
    const { isActive } = req.query;

    const filters = {};
    // Filter by active status if provided
    if (isActive !== undefined) {
      if (typeof isActive === 'string') {
        filters.isActive = isActive.toLowerCase() === 'true';
      } else {
        filters.isActive = Boolean(isActive);
      }
    }

    const sports = await Sport.findAll(filters);

    res.status(200).json({
      success: true,
      message: 'Sports retrieved successfully',
      data: {
        sports: sports.map((sport) => ({
          sportId: sport.sportId,
          name: sport.name,
          description: sport.description,
          icon: sport.icon,
          isActive: sport.isActive,
          createdAt: sport.createdAt,
          updatedAt: sport.updatedAt,
        })),
        count: sports.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get sport by ID
 * @route   GET /api/sports/:id
 * @access  Public
 */
const getSportById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const sport = await Sport.findById(id);
    if (!sport) {
      return res.status(404).json({
        success: false,
        error: 'Sport not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Sport retrieved successfully',
      data: {
        sport: {
          sportId: sport.sportId,
          name: sport.name,
          description: sport.description,
          icon: sport.icon,
          isActive: sport.isActive,
          createdAt: sport.createdAt,
          updatedAt: sport.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update sport
 * @route   PUT /api/sports/:id
 * @access  Private (Admin/Organiser only)
 */
const updateSport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, icon, isActive } = req.body;

    // Find sport by ID
    const sport = await Sport.findById(id);
    if (!sport) {
      return res.status(404).json({
        success: false,
        error: 'Sport not found',
      });
    }

    // Prepare update data
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (icon !== undefined) updateData.icon = icon ? icon.trim() : null;
    if (isActive !== undefined) {
      // Handle boolean values properly
      if (typeof isActive === 'string') {
        updateData.isActive = isActive.toLowerCase() === 'true';
      } else {
        updateData.isActive = Boolean(isActive);
      }
    }

    // If no fields are provided for update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields provided to update',
        message: 'Please provide at least one field to update (e.g., name, description, icon, isActive).',
      });
    }

    // Update sport
    try {
      const updated = await Sport.updateById(id, updateData);
      if (!updated) {
        return res.status(400).json({
          success: false,
          error: 'Failed to update sport. It might not exist or no changes were made.',
        });
      }
    } catch (error) {
      if (error.message === 'Sport with this name already exists') {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
      throw error;
    }

    // Fetch the updated sport to return in the response
    const updatedSport = await Sport.findById(id);

    res.status(200).json({
      success: true,
      message: 'Sport updated successfully',
      data: {
        sport: {
          sportId: updatedSport.sportId,
          name: updatedSport.name,
          description: updatedSport.description,
          icon: updatedSport.icon,
          isActive: updatedSport.isActive,
          createdAt: updatedSport.createdAt,
          updatedAt: updatedSport.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete sport
 * @route   DELETE /api/sports/:id
 * @access  Private (Admin/Organiser only)
 */
const deleteSport = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find sport by ID
    const sport = await Sport.findById(id);
    if (!sport) {
      return res.status(404).json({
        success: false,
        error: 'Sport not found',
      });
    }

    // Delete sport
    const deleted = await Sport.deleteById(id);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete sport',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Sport deleted successfully',
      data: {
        sportId: sport.sportId,
        name: sport.name,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSport,
  getAllSports,
  getSportById,
  updateSport,
  deleteSport,
};

