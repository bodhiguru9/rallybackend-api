const getPreferredNotificationChannel = (user) => {
  if (user?.email && String(user.email).trim()) {
    return { channel: 'email', value: String(user.email).trim() };
  }

  const whatsapp = user?.whatsappNumber || user?.mobileNumber;
  if (whatsapp && String(whatsapp).trim()) {
    return { channel: 'whatsapp', value: String(whatsapp).trim() };
  }

  return { channel: null, value: null };
};

module.exports = { getPreferredNotificationChannel };