/** Renders inputs from form_template_fields (field_type + options jsonb) and
 *  collects answers keyed by field_key into visit_forms.responses. */
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { FormField } from '../../api/visitForms.api';
import { colors, radius, spacing, typography } from '../../theme';

type Props = {
	fields: FormField[];
	values: Record<string, unknown>;
	onChange: (fieldKey: string, value: unknown) => void;
	disabled?: boolean;
};

export default function DynamicFormRenderer({ fields, values, onChange, disabled = false }: Props) {
	return (
		<View>
			{fields.map((field) => (
				<View key={field.id} style={styles.field}>
					<Text style={styles.label}>{field.label}{field.isRequired ? ' *' : ''}</Text>
					<FieldInput field={field} value={values[field.fieldKey]} disabled={disabled} onChange={(value) => onChange(field.fieldKey, value)} />
				</View>
			))}
		</View>
	);
}

function FieldInput({ field, value, disabled, onChange }: { field: FormField; value: unknown; disabled: boolean; onChange: (value: unknown) => void }) {
	const [datePickerOpen, setDatePickerOpen] = React.useState(false);

	if (field.fieldType === 'date') {
		const dateValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseIsoDate(value) : new Date();
		return (
			<View>
				<Pressable disabled={disabled} style={styles.input} onPress={() => setDatePickerOpen(true)}>
					<Text style={value ? styles.dateText : styles.placeholderText}>{value ? formatDate(dateValue) : 'Select date'}</Text>
				</Pressable>
				{datePickerOpen ? <DateTimePicker value={dateValue} mode="date" display="default" onChange={(event, selectedDate) => handleDateChange(event, selectedDate, setDatePickerOpen, onChange)} /> : null}
			</View>
		);
	}
	if (field.fieldType === 'boolean') {
		return (
			<View style={styles.optionRow}>
				{['Yes', 'No'].map((label) => {
					const selected = value === (label === 'Yes');
					return <Pressable key={label} disabled={disabled} style={[styles.option, selected && styles.optionSelected]} onPress={() => onChange(label === 'Yes')}><Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text></Pressable>;
				})}
			</View>
		);
	}
	if (field.fieldType === 'select' || field.fieldType === 'multiselect') {
		const selectedValues = field.fieldType === 'multiselect' && Array.isArray(value) ? value : [];
		return (
			<View style={styles.optionRow}>
				{(field.options ?? []).map((option) => {
					const selected = field.fieldType === 'multiselect' ? selectedValues.includes(option) : value === option;
					return <Pressable key={option} disabled={disabled} style={[styles.option, selected && styles.optionSelected]} onPress={() => onChange(field.fieldType === 'multiselect' ? (selected ? selectedValues.filter((item) => item !== option) : [...selectedValues, option]) : option)}><Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.replaceAll('_', ' ')}</Text></Pressable>;
				})}
			</View>
		);
	}
	return <TextInput editable={!disabled} value={value == null ? '' : String(value)} keyboardType={field.fieldType === 'number' ? 'numeric' : 'default'} placeholder="Enter response" placeholderTextColor={colors.textSecondary} multiline={field.fieldType === 'text'} onChangeText={(text) => onChange(field.fieldType === 'number' ? (text === '' ? null : Number(text)) : text)} style={[styles.input, field.fieldType === 'text' && styles.multiline]} />;
}

function parseIsoDate(value: string) {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

function formatDate(value: Date) {
	return value.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function toIsoDate(value: Date) {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function handleDateChange(event: DateTimePickerEvent, selectedDate: Date | undefined, close: (open: boolean) => void, onChange: (value: unknown) => void) {
	close(false);
	if (event.type === 'set' && selectedDate) onChange(toIsoDate(selectedDate));
}

const styles = StyleSheet.create({
	field: { marginBottom: spacing.lg },
	label: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium, marginBottom: spacing.xs },
	input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.textPrimary, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
	dateText: { color: colors.textPrimary, fontSize: typography.size.sm },
	placeholderText: { color: colors.textSecondary, fontSize: typography.size.sm },
	multiline: { minHeight: 96, textAlignVertical: 'top' },
	optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
	option: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
	optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
	optionText: { color: colors.textPrimary, fontSize: typography.size.xs },
	optionTextSelected: { color: colors.white, fontWeight: typography.weight.bold },
});
