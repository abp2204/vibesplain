// The implementation lives in `@vibesplain/brain` so every artifact producer in
// this repo shares one atomic tmp+rename writer and one manifest schema.
// Re-exported here because the renderers import `Artifact` from this path.
export {
  ArtifactBundleWriter,
  type Artifact,
  type ManifestArtifact,
  type ArtifactManifest,
} from '@vibesplain/brain';
