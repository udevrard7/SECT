// Package storage — client Cloudflare R2 (S3-compatible) via AWS SDK v2.
package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// R2Client implémente domain.StorageClient pour Cloudflare R2.
type R2Client struct {
	client    *s3.Client
	presigner *s3.PresignClient
	bucket    string
}

// NewR2Client crée un nouveau client R2 à partir des variables d'environnement.
//
// Variables requises :
//
//	R2_ACCOUNT_ID       — ID du compte Cloudflare
//	R2_ACCESS_KEY_ID    — Access Key ID
//	R2_SECRET_ACCESS_KEY — Secret Access Key
//	R2_BUCKET_NAME      — Nom du bucket (default: sect-documents)
//	R2_ENDPOINT         — Endpoint S3 (optionnel, default: https://{account_id}.r2.cloudflarestorage.com)
//	                      Pour l'UE: https://{account_id}.eu.r2.cloudflarestorage.com
func NewR2Client(ctx context.Context, accountID, accessKey, secretKey, bucket, endpointOverride string) (*R2Client, error) {
	if accountID == "" || accessKey == "" || secretKey == "" {
		return nil, fmt.Errorf("R2 credentials required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
	}
	if bucket == "" {
		bucket = "sect-documents"
	}

	// Endpoint R2 : override ou default
	endpoint := endpointOverride
	if endpoint == "" {
		endpoint = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)
	}

	// Charger la config AWS avec credentials statiques + resolver d'endpoint personnalisé
	cfg, err := awscfg.LoadDefaultConfig(ctx,
		awscfg.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		awscfg.WithRegion("auto"),
	)
	if err != nil {
		return nil, fmt.Errorf("load AWS config: %w", err)
	}

	// Créer le client S3 avec l'endpoint R2
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})

	presigner := s3.NewPresignClient(client)

	return &R2Client{
		client:    client,
		presigner: presigner,
		bucket:    bucket,
	}, nil
}

// Upload stocke un objet dans R2.
func (c *R2Client) Upload(ctx context.Context, obj domain.StorageObject) (string, error) {
	if obj.Key == "" {
		return "", fmt.Errorf("storage key required")
	}

	contentType := obj.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	_, err := c.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(c.bucket),
		Key:           aws.String(obj.Key),
		Body:          bytesReader(obj.Content),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(int64(len(obj.Content))),
	})
	if err != nil {
		return "", fmt.Errorf("upload to R2: %w", err)
	}

	return obj.Key, nil
}

// Download récupère un objet depuis R2.
func (c *R2Client) Download(ctx context.Context, key string) ([]byte, error) {
	resp, err := c.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("download from R2: %w", err)
	}
	defer resp.Body.Close()

	return io.ReadAll(resp.Body)
}

// Delete supprime un objet de R2.
func (c *R2Client) Delete(ctx context.Context, key string) error {
	_, err := c.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("delete from R2: %w", err)
	}
	return nil
}

// PresignURL génère une URL présignée pour télécharger un objet.
func (c *R2Client) PresignURL(ctx context.Context, key string, expiresIn int) (string, error) {
	if expiresIn <= 0 {
		expiresIn = 3600 // 1 heure par défaut
	}

	req, err := c.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(time.Duration(expiresIn)*time.Second))
	if err != nil {
		return "", fmt.Errorf("presign URL: %w", err)
	}

	return req.URL, nil
}

// PresignUpload génère une URL présignée pour uploader un objet directement
// depuis le navigateur (méthode PUT). P3-DEVOIRS-3 : upload direct-to-R2.
//
// Le navigateur fait un PUT HTTP sur l'URL retournée avec le fichier en body.
// Durée de validité recommandée : 300s (5 min) — max R2 = 7 jours.
func (c *R2Client) PresignUpload(ctx context.Context, key, contentType string, expiresIn int) (string, error) {
	if key == "" {
		return "", fmt.Errorf("storage key required")
	}
	if expiresIn <= 0 {
		expiresIn = 300 // 5 minutes par défaut pour l'upload
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	req, err := c.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	}, s3.WithPresignExpires(time.Duration(expiresIn)*time.Second))
	if err != nil {
		return "", fmt.Errorf("presign upload URL: %w", err)
	}

	return req.URL, nil
}

// GenerateObjectKey génère une clé R2 pour un document.
// Format: documents/{userId}/{timestamp}_{filename}
func GenerateObjectKey(userID, filename string) string {
	// Sanitize filename : remplacer les espaces et caractères spéciaux
	safeName := strings.ReplaceAll(filename, " ", "_")
	timestamp := time.Now().UnixMilli()
	return fmt.Sprintf("documents/%s/%d_%s", userID, timestamp, safeName)
}

// bytesReader convertit []byte en io.Reader.
func bytesReader(b []byte) *bytes.Reader {
	return bytes.NewReader(b)
}
