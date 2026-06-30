export interface Namer {
  /** Return the model's raw filename text (un-cleaned) for the given page image. */
  name(imagePng: Buffer, scanDate: string): Promise<string>;
}
