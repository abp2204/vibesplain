import { join } from 'path';
import { writeFile, mkdir, rm, rename } from 'fs/promises';
import { createHash } from 'crypto';

export interface Artifact {
  type: string;
  path: string;
  content: string | Buffer;
}

export interface ManifestArtifact {
  type: string;
  path: string;
  checksum: string;
  sizeBytes: number;
}

export interface ArtifactManifest {
  schemaVersion: string;
  generatedAt: string;
  projectRoot: string;
  artifacts: ManifestArtifact[];
}

/**
 * Atomic artifact-bundle writer (ADR-031: content-addressed integrity).
 *
 * Staging directory is populated in full, then swapped into place with a
 * rename pair, so a reader never observes a half-written bundle.
 *
 * `outputDirName` is the only knob: vibesplain writes `.vibesplain`, other
 * consumers in this repo pass their own (teardown writes `.teardown`). The
 * staging and rollback directories are derived from it.
 */
export class ArtifactBundleWriter {
  constructor(
    private projectRoot: string,
    private outputDirName: string = '.vibesplain',
  ) {}

  async writeBundle(artifacts: Artifact[]): Promise<void> {
    const outputDir = join(this.projectRoot, this.outputDirName);
    const stagingDir = join(this.projectRoot, `${this.outputDirName}.tmp`);
    const oldDir = join(this.projectRoot, `${this.outputDirName}.old`);

    try {
      await rm(stagingDir, { recursive: true, force: true });
      await rm(oldDir, { recursive: true, force: true });

      const { existsSync } = await import('fs');
      const { cp } = await import('fs/promises');

      if (existsSync(outputDir)) {
        await cp(outputDir, stagingDir, { recursive: true });
      } else {
        await mkdir(stagingDir, { recursive: true });
      }

      const manifestArtifacts: ManifestArtifact[] = [];

      for (const artifact of artifacts) {
        const destPath = join(stagingDir, artifact.path);
        await mkdir(join(destPath, '..'), { recursive: true });

        await writeFile(destPath, artifact.content);

        const contentStr = artifact.content;
        const buffer = typeof contentStr === 'string' ? Buffer.from(contentStr, 'utf-8') : contentStr;

        manifestArtifacts.push({
          type: artifact.type,
          path: artifact.path,
          checksum: 'sha256:' + createHash('sha256').update(buffer).digest('hex'),
          sizeBytes: buffer.length,
        });
      }

      const manifest: ArtifactManifest = {
        schemaVersion: '1.0.0',
        generatedAt: new Date().toISOString(),
        projectRoot: this.projectRoot,
        artifacts: manifestArtifacts,
      };

      await writeFile(
        join(stagingDir, 'artifact_manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8'
      );

      // Atomic swap pattern:
      // 1. Rename current -> old
      // 2. Rename staging -> current
      // 3. Remove old
      let swapped = false;
      if (existsSync(outputDir)) {
        await rename(outputDir, oldDir);
        swapped = true;
      }

      try {
        await rename(stagingDir, outputDir);
      } catch (err) {
        // Rollback if possible
        if (swapped) {
          await rename(oldDir, outputDir);
        }
        throw err;
      }

      if (swapped) {
        await rm(oldDir, { recursive: true, force: true });
      }

    } catch (err) {
      await rm(stagingDir, { recursive: true, force: true });
      throw err;
    }
  }
}
