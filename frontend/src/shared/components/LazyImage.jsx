import React, { useState } from 'react';
import { handleImageError, DEFAULT_PRODUCT_IMAGE } from "@/core/utils/imageUtils";

const LazyImage = ({ src, alt = '', className = '', onError, ...rest }) => {
  const [loaded, setLoaded] = useState(false);

  const handleError = (e) => {
    if (typeof onError === 'function') {
      onError(e);
    } else {
      handleImageError(e, DEFAULT_PRODUCT_IMAGE);
    }
  };

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={handleError}
      className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      {...rest}
    />
  );
};

export default LazyImage;

