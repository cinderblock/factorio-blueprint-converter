declare module 'chartist-svg' {
  type ChartType = 'line' | 'bar' | 'pie';

  interface ChartPadding {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  }

  interface ChartOptions {
    width?: number;
    height?: number;
    chartPadding?: ChartPadding;
    // Add other chart-specific options if necessary
  }

  interface TitleOptions {
    x?: number;
    y?: number;
    height?: number;
    'font-size'?: string;
    'font-family'?: string;
    'font-weight'?: string;
    fill?: string;
    'text-anchor'?: string;
    // ... other SVG attributes
  }

  interface SubtitleOptions {
    x?: number;
    y?: number;
    height?: number;
    'font-size'?: string;
    'font-family'?: string;
    'font-weight'?: string;
    fill?: string;
    'text-anchor'?: string;
    // ... other SVG attributes
  }

  interface Options {
    chart?: ChartOptions;
    title?: TitleOptions;
    subtitle?: SubtitleOptions;
    css?: string;
  }

  interface Data {
    title?: string;
    subtitle?: string;
    labels: string[];
    series: number[][];
  }

  /**
   * Generates an SVG string based on the provided chart type, data, and options.
   *
   * @param type - The type of chart to generate ('line', 'bar', or 'pie').
   * @param data - The data for the chart, including title, subtitle, labels, and series.
   * @param options - Optional configuration options for the chart's appearance.
   * @returns A promise that resolves to the generated SVG string.
   */
  function chartistSvg(type: ChartType, data: Data, options?: Options): Promise<string>;

  export = chartistSvg;
}
