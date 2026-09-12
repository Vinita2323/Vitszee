import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SubCategories = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/admin/categories", { replace: true });
  }, [navigate]);

  return null;
};

export default SubCategories;
