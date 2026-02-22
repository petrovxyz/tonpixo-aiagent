declare module 'react-plotly.js' {
  import * as React from 'react';

  type PlotlyComponentProps = {
    data?: unknown[];
    layout?: Record<string, unknown>;
    config?: Record<string, unknown>;
    frames?: unknown[];
    useResizeHandler?: boolean;
    style?: React.CSSProperties;
    className?: string;
    onInitialized?: (...args: unknown[]) => void;
    onUpdate?: (...args: unknown[]) => void;
    onRelayout?: (...args: unknown[]) => void;
  };

  const Plot: React.ComponentType<PlotlyComponentProps>;
  export default Plot;
}

declare module 'react-plotly.js/factory' {
  import * as React from 'react';

  type PlotlyComponentProps = {
    data?: unknown[];
    layout?: Record<string, unknown>;
    config?: Record<string, unknown>;
    frames?: unknown[];
    useResizeHandler?: boolean;
    style?: React.CSSProperties;
    className?: string;
    onInitialized?: (...args: unknown[]) => void;
    onUpdate?: (...args: unknown[]) => void;
    onRelayout?: (...args: unknown[]) => void;
  };

  const createPlotlyComponent: (plotly: unknown) => React.ComponentType<PlotlyComponentProps>;
  export default createPlotlyComponent;
}

declare module 'plotly.js-basic-dist-min' {
  const Plotly: Record<string, unknown>;
  export default Plotly;
}
