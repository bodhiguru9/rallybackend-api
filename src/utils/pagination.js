/**
 * Pagination Utility
 * Provides reusable functions for page-based pagination
 */

/**
 * Calculate pagination values from page number
 * @param {number} page - Current page number (default: 1)
 * @param {number} perPage - Items per page (default: 20)
 * @returns {object} Object containing skip, perPage, and page
 */
const getPaginationParams = (page = 1, perPage = 20) => {
  const currentPage = parseInt(page) || 1;
  const itemsPerPage = parseInt(perPage) || 20;
  const skip = (currentPage - 1) * itemsPerPage;

  return {
    page: currentPage,
    perPage: itemsPerPage,
    skip,
  };
};

/**
 * Create pagination response object
 * @param {number} totalCount - Total number of items
 * @param {number} page - Current page number
 * @param {number} perPage - Items per page
 * @returns {object} Pagination object with all pagination info
 */
const createPaginationResponse = (totalCount, page, perPage) => {
  const totalPages = Math.ceil(totalCount / perPage);
  const currentPage = parseInt(page) || 1;

  return {
    totalCount,
    totalPages,
    currentPage,
    perPage,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  };
};

/**
 * Get pagination params and create response in one call
 * Useful for endpoints that need both
 * @param {number} page - Current page number
 * @param {number} perPage - Items per page (default: 20)
 * @param {number} totalCount - Total number of items
 * @returns {object} Object with pagination params and response
 */
const getPagination = (page = 1, perPage = 20, totalCount = 0) => {
  const params = getPaginationParams(page, perPage);
  const pagination = createPaginationResponse(totalCount, params.page, params.perPage);

  return {
    ...params,
    pagination,
  };
};

module.exports = {
  getPaginationParams,
  createPaginationResponse,
  getPagination,
};

