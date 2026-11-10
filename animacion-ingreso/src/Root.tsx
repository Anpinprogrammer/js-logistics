import React from "react";
import { Composition } from "remotion";
import { Intro, ESCRITORIO, CELULAR } from "./Intro";

export const Root: React.FC = () => (
  <>
    <Composition id="Escritorio" component={Intro} durationInFrames={240} fps={60} width={1440} height={900} defaultProps={{ L: ESCRITORIO }} />
    <Composition id="Celular" component={Intro} durationInFrames={240} fps={60} width={390} height={844} defaultProps={{ L: CELULAR }} />
  </>
);
