"use client";

import { useParams } from "next/navigation";
import { CampoForm } from "@/components/dashboard/CampoForm";

export default function CrearCampoPage() {
  const params = useParams();
  return <CampoForm canchaId={params.id as string} />;
}
