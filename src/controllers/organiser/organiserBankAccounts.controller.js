const OrganiserBankAccount = require('../../models/OrganiserBankAccount');

/**
 * @desc    Create organiser bank account (Account holder name, IBAN, Bank name)
 * @route   POST /api/organizers/bank-accounts
 * @access  Private (Organiser only)
 * Body: { "accountHolderName": "...", "iban": "...", "bankName": "..." }
 */
const createBankAccount = async (req, res, next) => {
  try {
    const organizerId = req.user.id; // MongoDB _id from auth

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can add bank accounts',
      });
    }

    const { accountHolderName, iban, bankName } = req.body;

    const doc = await OrganiserBankAccount.create(organizerId, {
      accountHolderName,
      iban,
      bankName,
    });

    res.status(201).json({
      success: true,
      message: 'Bank account saved successfully',
      data: {
        bankAccount: {
          id: doc.bankAccountId,
          bankAccountId: doc.bankAccountId,
          accountHolderName: doc.accountHolderName,
          iban: doc.iban,
          bankName: doc.bankName,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        },
      },
    });
  } catch (error) {
    if (error.message && (error.message.includes('required') || error.message.includes('Invalid'))) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Get all bank accounts for the current organiser
 * @route   GET /api/organizers/bank-accounts
 * @access  Private (Organiser only)
 */
const getAllBankAccounts = async (req, res, next) => {
  try {
    const organizerId = req.user.id;

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view bank accounts',
      });
    }

    const list = await OrganiserBankAccount.findByOrganizerId(organizerId);

    res.status(200).json({
      success: true,
      message: 'Bank accounts retrieved successfully',
      data: {
        bankAccounts: list.map((doc) => ({
          id: doc.bankAccountId,
          bankAccountId: doc.bankAccountId,
          accountHolderName: doc.accountHolderName,
          iban: doc.iban,
          bankName: doc.bankName,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })),
        total: list.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get one bank account by id (must belong to current organiser)
 * @route   GET /api/organizers/bank-accounts/:id
 * @access  Private (Organiser only)
 */
const getBankAccountById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const organizerId = req.user.id;

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view bank accounts',
      });
    }

    const doc = await OrganiserBankAccount.findById(id, organizerId);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Bank account not found',
        id,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Bank account retrieved successfully',
      data: {
        bankAccount: {
          id: doc.bankAccountId,
          bankAccountId: doc.bankAccountId,
          accountHolderName: doc.accountHolderName,
          iban: doc.iban,
          bankName: doc.bankName,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a bank account by id (must belong to current organiser)
 * @route   PUT /api/organizers/bank-accounts/:id
 * @access  Private (Organiser only)
 * Body: { "accountHolderName": "...", "iban": "...", "bankName": "..." } (all optional)
 */
const updateBankAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const organizerId = req.user.id;
    const { accountHolderName, iban, bankName } = req.body;

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can update bank accounts',
      });
    }

    const updated = await OrganiserBankAccount.updateById(id, organizerId, {
      accountHolderName,
      iban,
      bankName,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Bank account not found',
        id,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Bank account updated successfully',
      data: {
        bankAccount: {
          id: updated.bankAccountId,
          bankAccountId: updated.bankAccountId,
          accountHolderName: updated.accountHolderName,
          iban: updated.iban,
          bankName: updated.bankName,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a bank account by id (must belong to current organiser)
 * @route   DELETE /api/organizers/bank-accounts/:id
 * @access  Private (Organiser only)
 */
const deleteBankAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const organizerId = req.user.id;

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can delete bank accounts',
      });
    }

    const deleted = await OrganiserBankAccount.deleteById(id, organizerId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Bank account not found',
        id,
      });
    }

    const deletedId = id; // id can be bankAccountId (BA1) or MongoDB _id
    res.status(200).json({
      success: true,
      message: 'Bank account deleted successfully',
      data: {
        id: deletedId,
        deletedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBankAccount,
  getAllBankAccounts,
  getBankAccountById,
  updateBankAccount,
  deleteBankAccount,
};
