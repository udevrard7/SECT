// SECT Mobile — Écran Liste des Conversations
package com.sect.mobile.android.ui.screens.messagerie

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.viewmodel.MessagerieViewModel
import com.sect.mobile.android.ui.viewmodel.UiState

/**
 * Écran de liste des conversations
 * Inspiré du frontend web: /frontend/src/app/messagerie/page.tsx
 */
@Composable
fun MessagerieScreen(
    viewModel: MessagerieViewModel,
    onConversationClick: (String) -> Unit,
    onBack: () -> Unit = {}
) {
    val conversations by viewModel.conversations.collectAsState()

    when (val state = conversations) {
        is UiState.Loading -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        is UiState.Error -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(state.message, color = MaterialTheme.colorScheme.error)
            }
        }
        is UiState.Success -> {
            val list = state.data
            if (list.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.Chat,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Aucune conversation",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(list.size, key = { list[it].id }) { index ->
                        val conv = list[index]
                        ListItem(
                            headlineContent = { 
                                Text(
                                    conv.titre ?: "Conversation",
                                    fontWeight = if (conv.unreadCount > 0) FontWeight.Bold else FontWeight.Normal
                                ) 
                            },
                            supportingContent = { 
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(conv.type.name)
                                    if (conv.unreadCount > 0) {
                                        Surface(
                                            shape = MaterialTheme.shapes.small,
                                            color = MaterialTheme.colorScheme.primary
                                        ) {
                                            Text(
                                                "${conv.unreadCount}",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onPrimary,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                }
                            },
                            leadingContent = {
                                Icon(
                                    Icons.Default.Chat, 
                                    null,
                                    tint = if (conv.unreadCount > 0) 
                                        MaterialTheme.colorScheme.primary 
                                    else 
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            },
                            modifier = Modifier.clickable { onConversationClick(conv.id) }
                        )
                    }
                }
            }
        }
    }
}
