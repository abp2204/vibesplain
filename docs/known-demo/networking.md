# Known demo: service mesh and reverse proxies

This document was prepared for Known acceptance testing. It is a labeled demo source, not evidence of earlier personal notes or an existing production deployment.

## Reverse proxy

A reverse proxy receives traffic on behalf of an upstream application and forwards requests to it. It can centralize concerns such as routing and TLS termination. An ingress proxy typically handles traffic entering a cluster; it is not by itself a complete service mesh.

## Service mesh

A service mesh manages communication between services. In a sidecar-based mesh, a proxy runs alongside each application workload. These proxies form the data plane, handling network traffic; the control plane distributes configuration and policy.

## Sidecar proxy

A sidecar proxy handles networking beside the application. Relating this to a reverse proxy: the familiar forwarding role moves near each workload, so the mesh can apply traffic policies consistently across service-to-service calls. A sidecar is one deployment model, not a requirement of every service mesh.

## Demo question

Explain service mesh using what I already know about reverse proxies. Then describe how a sidecar proxy participates when service A calls service B.

## Go request cancellation: context.Context

In a Go reverse proxy, `context.Context` carries a request's cancellation and deadline across function calls. Passing the incoming request's context to an outbound HTTP request lets cancellation stop unnecessary upstream work. A service mesh handles network policy, but application code still needs to propagate request cancellation correctly.

## Provenance

This is an intentionally authored demo document. The original repository file and its pinned revision should be visible in Known's citation. Compare with the architecture documentation at https://istio.io/latest/docs/ops/deployment/architecture/.
