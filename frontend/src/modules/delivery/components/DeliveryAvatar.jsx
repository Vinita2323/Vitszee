import React, { useEffect, useState } from "react";
import { applyCloudinaryTransform } from "@core/utils/imageUtils";

function fallbackAvatar(user) {
  const seed = encodeURIComponent(user?.name || user?.phone || "partner");
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=0057b7&textColor=ffffff`;
}

/**
 * Shows the delivery partner's uploaded profile photo when available.
 */
const DeliveryAvatar = ({ user, className = "w-full h-full rounded-full object-cover bg-gray-100", alt }) => {
  const profileUrl = typeof user?.profileImage === "string" ? user.profileImage.trim() : "";
  const optimized = profileUrl
    ? applyCloudinaryTransform(profileUrl, "f_auto,q_auto,w_200,h_200,c_fill") || profileUrl
    : null;
  const [src, setSrc] = useState(optimized || fallbackAvatar(user));

  useEffect(() => {
    setSrc(optimized || fallbackAvatar(user));
  }, [optimized, user?.name, user?.phone]);

  return (
    <img
      src={src}
      alt={alt || user?.name || "Profile"}
      className={className}
      onError={() => setSrc(fallbackAvatar(user))}
    />
  );
};

export default DeliveryAvatar;
